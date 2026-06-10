# Firefly X TalkTable — 10 · Firebase Setup Guide

> Step-by-step production setup for the TalkTable Firebase backend: three environments (`dev` local emulators, `staging`, `prod`), Node 20 Cloud Functions, CI deploys via GitHub Actions, cost model, and quota gotchas.

---

## 1. Project Creation

1. Create a Google Cloud **organization folder** `fireflyx` (billing isolation, IAM inheritance).
2. Create two Firebase projects (dev uses emulators only — no third project needed):
   - `talktable-staging`
   - `talktable-prod`
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase projects:create talktable-staging --display-name "TalkTable Staging"
   firebase projects:create talktable-prod --display-name "TalkTable Production"
   ```
3. Attach a **Blaze (pay-as-you-go)** billing account to both (required for Cloud Functions, outbound network calls to AI providers/Stripe). Set **budget alerts** immediately: staging $50, prod $500/$1000/$2000 thresholds.
4. In the repo:
   ```bash
   firebase use --add talktable-staging   # alias: staging
   firebase use --add talktable-prod      # alias: prod
   ```
   `.firebaserc` is committed; `firebase use staging` switches context.
5. Register apps: one **Web app** per project (Console → Project settings → Add app). Copy the web config into `apps/web/.env.local` as `NEXT_PUBLIC_FIREBASE_*` vars (these are public identifiers, not secrets).

## 2. Authentication

Console → Authentication → Sign-in method, enable:

1. **Email/Password** — all staff/management/platform users. Disable self-signup paths in app logic (accounts are provisioned/invited only). Enable **email enumeration protection**.
2. **Anonymous** — customer table sessions. Each QR scan signs in anonymously; the session doc binds the anon UID to a table token.
3. Authorized domains: add `app.fireflyx.io`, staging domain, `localhost`.
4. **Custom claims** drive authorization (set only by Cloud Functions in `onboarding/` and `staff` management):
   ```ts
   { role: "waiter"|"cashier"|"kitchen"|"manager"|"owner"|"platform_admin"|"super_admin",
     restaurantId?: string, branchIds?: string[] }
   ```
   Customers have no claims (anonymous). Claims changes require token refresh — the client forces `getIdToken(true)` after role mutations.
5. Settings → user actions: block account deletion by users; session cookie duration 14 days for staff (server-side session cookies via `firebase-admin`).

## 3. Firestore — Region Choice & Setup

**Region decision for Jordan latency:** Firestore has no `me-west1` multi-service guarantee parity — evaluate:

| Option | RTT from Amman (typical) | Notes |
|---|---|---|
| `me-west1` (Tel Aviv) | ~10–25 ms | Lowest latency; verify availability for Firestore + Functions gen2 + your org's data-residency stance |
| `europe-west1` (Belgium) | ~60–80 ms | Safe default, all products available |
| `europe-west4` (Netherlands) | ~60–85 ms | Alternative EU |

**Recommendation:** `me-west1` if acceptable to the business; otherwise `europe-west1`. **The region is permanent per project — decide before creating the database.** Put Functions and Storage in the same region as Firestore.

```bash
firebase firestore:databases:create "(default)" --location=me-west1 --project talktable-prod
```

- Mode: Native mode.
- Deploy rules + composite indexes from repo: `firebase deploy --only firestore` (uses `firestore.rules`, `firestore.indexes.json`).
- Enable **Point-in-time recovery** (prod) and schedule daily exports to a GCS bucket (`gcloud firestore export gs://talktable-prod-backups/$(date +%F)` via Cloud Scheduler) — Firestore has no built-in undo.

## 4. Storage Buckets

1. Default bucket auto-created in project region — used for **menu images** (`/restaurants/{rid}/menu/{itemId}/…`) and **logos**.
2. Additional buckets:
   - `talktable-prod-receipts` — generated receipt PDFs (lifecycle rule: delete after 18 months).
   - `talktable-prod-backups` — Firestore exports (lifecycle: 90 days; storage class Nearline).
   - `talktable-prod-qr` — generated QR PDF sheets.
3. Deploy `storage.rules`: public read for menu images (or signed URLs), writes only via authenticated management roles scoped to their `restaurantId`.
4. Enable image resizing: install the **Resize Images extension** (or generate sizes in the upload function) — serve 400w/800w variants for `MenuItemCard`.

## 5. Cloud Functions (Node 20)

1. `functions/package.json`:
   ```json
   { "engines": { "node": "20" } }
   ```
2. Use **2nd-gen functions** (Cloud Run-based) for better concurrency and region control; pin region to match Firestore:
   ```ts
   import { setGlobalOptions } from "firebase-functions/v2";
   setGlobalOptions({ region: "me-west1", maxInstances: 50 });
   ```
3. Per-function tuning:
   - `stripeWebhook`, `createPaymentIntent`: `minInstances: 1` in prod (kill cold starts in the payment path), `concurrency: 80`.
   - `onOrderStatusChange` → billing event writer: default; **must be idempotent** (doc id = `be_{orderId}`, `create()` not `set()` so retries no-op).
   - Scheduled: `nightlyBillingAggregate` (03:00 Asia/Amman), `sessionCleanup` (hourly), `autoUn86` (per-restaurant open time), `monthlyStatements` (1st, 04:00).
4. Build: functions workspace compiles TS → `lib/`; `firebase.json` `functions.source: "functions"`, predeploy `pnpm --filter functions build`.

## 6. Environment & Secret Management

- **Public client config**: `NEXT_PUBLIC_FIREBASE_*` in `apps/web/.env.local` / hosting env. Never put secrets in `NEXT_PUBLIC_*`.
- **Server secrets** (AI provider keys, Stripe secret + webhook signing secret) → **Cloud Secret Manager**, consumed by gen2 functions:
  ```bash
  firebase functions:secrets:set STRIPE_SECRET_KEY --project talktable-prod
  firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
  firebase functions:secrets:set AI_PRIMARY_API_KEY
  firebase functions:secrets:set AI_FALLBACK_API_KEY
  ```
  ```ts
  export const stripeWebhook = onRequest({ secrets: ["STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET"] }, handler);
  ```
- Next.js server runtime (AI chat route) on Vercel or Firebase App Hosting: mirror the same secrets as runtime env vars there; `.env.example` documents every variable with a one-line description.
- Service accounts: CI deploys use **Workload Identity Federation** (no JSON keys). Local admin scripts use `gcloud auth application-default login`.

## 7. Emulator Suite (local dev)

`firebase.json`:
```json
{
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "storage":   { "port": 9199 },
    "pubsub":    { "port": 8085 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```
Workflow:
```bash
pnpm dev:emulators   # firebase emulators:start --import=./.emulator-data --export-on-exit
pnpm dev             # next dev with NEXT_PUBLIC_USE_EMULATORS=1 (connectAuthEmulator etc.)
pnpm seed            # scripts/seed.ts: demo restaurant, 12 tables, menu, staff users
```
- Seeded data exported to `.emulator-data/` (gitignored) for fast restarts; a canonical seed snapshot is rebuilt by `pnpm seed` deterministically for CI.
- Rules unit tests and Functions tests run against emulators in CI (`firebase emulators:exec "vitest run"`).
- Stripe locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## 8. Deploy Commands

```bash
# everything (staging)
firebase use staging && firebase deploy

# targeted
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
firebase deploy --only functions                 # all
firebase deploy --only functions:stripeWebhook   # single function
firebase deploy --only hosting                   # if hosting the web app on Firebase
firebase hosting:channel:deploy pr-123 --expires 7d   # preview channel
```
Order matters on schema-affecting releases: **indexes → rules → functions → web app**.

## 9. CI Deploy — GitHub Actions

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]        # → staging
    tags: ["v*"]            # → prod
permissions:
  contents: read
  id-token: write           # Workload Identity Federation
concurrency: deploy-${{ github.ref }}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck test i18n:check
      - name: Rules & functions tests (emulators)
        run: pnpm dlx firebase-tools emulators:exec --only firestore,auth "pnpm test:rules && pnpm --filter functions test"
  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: ${{ startsWith(github.ref, 'refs/tags/') && 'production' || 'staging' }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}
      - name: Deploy Firebase
        run: |
          PROJECT=${{ startsWith(github.ref, 'refs/tags/') && 'talktable-prod' || 'talktable-staging' }}
          pnpm dlx firebase-tools deploy \
            --project "$PROJECT" \
            --only firestore,storage,functions,hosting \
            --force --non-interactive
```
- `production` environment has a **required reviewer** rule (manual approval gate).
- A separate `preview.yml` deploys PR builds to `hosting:channel` with the channel URL commented on the PR.

## 10. Cost Estimation

Assumptions per active restaurant/day: ~120 orders, ~8 Firestore writes + ~40 reads per order session (realtime listeners), ~60 AI chats (≈1.5k tokens each, AI billed separately to provider), images cached by CDN.

| Monthly | 1 restaurant | 100 restaurants | 10,000 restaurants |
|---|---|---|---|
| Firestore reads | ~150k → **free tier** | ~15M → ~$5 | ~1.5B → ~$540 |
| Firestore writes | ~30k → free | ~3M → ~$5 | ~300M → ~$540 |
| Storage (GB + egress) | <1 GB → ~$0 | ~40 GB + CDN → ~$10 | ~3 TB + egress → ~$400 |
| Functions (invocations + GB-s, min-instances) | ~$1 | ~$40 (incl. 1 warm payment fn ≈ $10) | ~$2,500 |
| Auth (anon + email) | $0 | $0 | ~$0 (no SMS) |
| Hosting/CDN | ~$1 | ~$25 | ~$800 |
| **Firebase total (rough)** | **≈ $2–5** | **≈ $80–120** | **≈ $4,500–6,000** |
| Revenue @0.10 JOD × completed orders | ~360 JOD | ~36k JOD | ~3.6M JOD |

Notes: AI provider tokens and Stripe fees are the dominant non-Firebase costs; at 10k scale, renegotiate egress (Cloud CDN), and consider Firestore read reduction via aggregated dashboard docs (write-time aggregation already designed in `functions/billing`).

## 11. Quota & Limit Gotchas

- **1 write/sec per document (sustained)** — never keep a hot counter doc (e.g., "orders today") updated per order at scale; use distributed counters or write-time sharded aggregates.
- **Firestore doc max 1 MiB** — chat transcripts go in a `messages` subcollection, never an array on the session doc.
- **500 ops per batched write / transaction**; transactions retry on contention — keep them small (order placement touches ≤5 docs).
- **Composite indexes required** for every multi-field query (`branchId + status + createdAt`); deploy indexes **before** the code that queries them ships.
- **Realtime listeners** count every matching doc change as a read — scope KDS listeners to `status in [PLACED, ACCEPTED, PREPARING, READY]` + today only.
- **Functions gen2 cold starts**: payment + AI paths get `minInstances`; everything else tolerates them.
- **Function timeout** default 60s (max 540s HTTP / 3600s gen2); AI streaming goes through the Next.js server route, not Functions, to avoid timeout/streaming limits.
- **Custom claims ≤1000 bytes** — store `branchIds` list compactly; for users spanning many branches store scope in Firestore and put only `restaurantId` in claims.
- **Anonymous user accumulation** — schedule deletion of anon users >30 days old (Auth has no TTL).
- **Scheduled functions** run in UTC by default — set `timeZone: "Asia/Amman"` explicitly.
- **Stripe webhooks**: must respond <10s and be idempotent (event id dedupe doc) — Stripe retries for days.
- **Emulator ≠ prod parity**: emulator doesn't enforce index requirements — CI must also run a staging smoke test that exercises real queries.
- **Region is immutable** for Firestore and default bucket; **project ID is immutable** — name carefully.
- **Hosting rewrites to Functions/Run** add latency; keep the customer app's static shell on CDN and hydrate data client-side from Firestore.
