# Firefly X TalkTable — 09 · Monorepo Folder Structure

> Target structure for the full platform. Tooling: **pnpm workspaces + Turborepo**, Next.js 15 (App Router) + TailwindCSS + Framer Motion, Firebase (Auth/Firestore/Storage/Functions Node 20/Hosting), Vitest + Playwright, GitHub Actions.

```
talktable/
├── package.json                     # workspace root: scripts, pnpm workspaces
├── pnpm-workspace.yaml              # apps/*, packages/*, functions
├── turbo.json                       # build/test/lint pipeline + caching
├── tsconfig.base.json               # shared strict TS config, path aliases (@tt/*)
├── .eslintrc.cjs                    # shared lint (incl. no-physical-CSS rule for RTL)
├── .prettierrc                      # formatting
├── .env.example                     # documented env vars (never real secrets)
├── firebase.json                    # hosting rewrites, emulators, functions config
├── .firebaserc                      # project aliases: default / staging / prod
├── firestore.rules                  # security rules (role/branch scoped)
├── firestore.indexes.json           # composite indexes (orders by branch+status+ts, …)
├── storage.rules                    # Storage security rules (menu images, receipts)
│
├── apps/
│   └── web/                         # the single Next.js app (all 8 user types)
│       ├── next.config.ts           # images, i18n routing, transpile @tt/* packages
│       ├── tailwind.config.ts       # consumes tokens from @tt/ui
│       ├── middleware.ts            # locale negotiation + role-route guards (session cookie)
│       ├── public/                  # static assets, PWA manifest, icons, sw.js
│       └── src/
│           ├── app/
│           │   ├── layout.tsx               # root: theme/dir/lang providers, fonts
│           │   ├── (customer)/              # anonymous-auth surface, mobile-first
│           │   │   └── r/[slug]/[tableToken]/
│           │   │       ├── page.tsx         # landing
│           │   │       ├── chat/page.tsx    # AI chat + voice mode
│           │   │       ├── menu/page.tsx    # menu grid (+ item sheet route-modal)
│           │   │       ├── cart/page.tsx    # cart & place order
│           │   │       ├── orders/page.tsx  # live tracking
│           │   │       ├── pay/page.tsx     # bill + Stripe payment
│           │   │       └── feedback/page.tsx
│           │   ├── (staff)/                 # waiter / kitchen / cashier shells
│           │   │   ├── login/page.tsx
│           │   │   ├── waiter/page.tsx      # table map + request center
│           │   │   ├── kitchen/page.tsx     # KDS board
│           │   │   └── cashier/page.tsx     # POS view
│           │   ├── (management)/            # manager + owner console
│           │   │   ├── dashboard/page.tsx   # branch dashboard
│           │   │   ├── overview/page.tsx    # owner multi-branch overview
│           │   │   ├── compare/page.tsx     # branch comparison
│           │   │   ├── analytics/page.tsx
│           │   │   ├── menu/…               # menu manager (+ item editor)
│           │   │   ├── staff/…              # employee manager
│           │   │   ├── inventory/…
│           │   │   ├── crm/…                # customer profiles
│           │   │   ├── ai-knowledge/…       # knowledge editor + test sandbox
│           │   │   ├── qr/…                 # QR manager
│           │   │   └── billing/page.tsx     # owner statement view
│           │   ├── (platform)/              # platform admin + super admin
│           │   │   └── admin/
│           │   │       ├── restaurants/…    # list, detail, onboarding wizard
│           │   │       ├── monitoring/…     # AI usage monitor, health
│           │   │       ├── support/…        # ticket queue
│           │   │       └── billing/…        # reconciliation dashboard
│           │   └── api/                     # thin route handlers only (webhooks, AI proxy)
│           │       ├── ai/chat/route.ts     # streams via @tt/ai (server-only keys)
│           │       └── webhooks/stripe/route.ts
│           ├── components/                  # app-specific compositions (page sections)
│           ├── features/                    # feature modules: hooks+logic per domain
│           │   ├── ordering/  cart/  tracking/  requests/  kds/  pos/
│           │   ├── analytics/  menu-admin/  crm/  onboarding/  billing/
│           ├── lib/
│           │   ├── firebase/client.ts       # client SDK init (lazy)
│           │   ├── firebase/admin.ts        # admin SDK (server only)
│           │   ├── session.ts               # table session + staff session helpers
│           │   └── analytics.ts             # event tracking wrapper
│           ├── i18n/
│           │   ├── request.ts               # next-intl config (locale from path/cookie)
│           │   └── messages handled in packages/i18n (see below)
│           └── styles/globals.css           # token CSS vars import, base layers
│
├── packages/
│   ├── ui/                          # @tt/ui — design system (doc 08)
│   │   ├── src/tokens/              # colors.ts, typography.ts, motion.ts, tailwind-preset.ts
│   │   ├── src/components/          # Button/, Input/, Modal/, VoiceOrb/, … (one dir each:
│   │   │                            #   Component.tsx, .stories.tsx, .test.tsx, index.ts)
│   │   ├── src/hooks/               # useReducedMotionSafe, useDirection, useTheme
│   │   └── .storybook/              # Storybook w/ dir+theme toolbars, a11y addon
│   ├── types/                       # @tt/types — shared domain types
│   │   ├── src/order.ts             # Order, OrderStatus machine, LineItem
│   │   ├── src/restaurant.ts        # Restaurant, Branch, Table, MenuItem, Modifier
│   │   ├── src/user.ts              # Role union (8 types), claims shape
│   │   ├── src/billing.ts           # BillingEvent (0.10 JOD), Statement, Invoice
│   │   └── src/api.ts               # request/response contracts, zod schemas
│   ├── ai/                          # @tt/ai — provider abstraction (server-only)
│   │   ├── src/provider.ts          # AIProvider interface: chat(), stream(), tools
│   │   ├── src/providers/           # one adapter per vendor + fallback chain
│   │   ├── src/tools/               # search_menu, add_to_cart, … tool definitions
│   │   ├── src/retrieval.ts         # knowledge-base retrieval (embeddings)
│   │   ├── src/voice/               # STT/TTS adapters
│   │   └── src/guardrails.ts        # prompt-injection filters, output validation
│   └── i18n/                        # @tt/i18n — message catalogs + helpers
│       ├── messages/en/             # common.json, customer.json, staff.json,
│       │                            # management.json, platform.json, errors.json
│       ├── messages/ar/             # same keys, Arabic (CI fails on key drift)
│       └── src/format.ts            # currency (JOD), dates, plural rules ar/en
│
├── functions/                       # Firebase Cloud Functions (Node 20, TS)
│   ├── package.json                 # separate deployable, uses @tt/types
│   └── src/
│       ├── index.ts                 # exports grouped by domain (codebases/regions)
│       ├── orders/                  # onOrderCreate (notify), onStatusChange (events),
│       │   └── billingEvent.ts      #   CLOSED → idempotent 0.10 JOD billingEvents write
│       ├── billing/                 # nightly aggregation, monthly statements, Stripe invoices,
│       │   └── reconcile.ts         #   events-vs-orders reconciliation job
│       ├── payments/                # createPaymentIntent (callable), stripeWebhook
│       ├── notifications/           # FCM fanout: requests→waiters, ready→waiters
│       ├── ai/                      # token-usage metering, anomaly detection
│       ├── onboarding/              # provisionRestaurant, generateTableTokens+QR PDFs
│       ├── crm/                     # session→profile linking, feedback aggregation
│       ├── maintenance/             # session TTL cleanup, auto-un-86, daily reports
│       └── lib/                     # admin init, idempotency helper, audit log writer
│
├── e2e/                             # Playwright: customer journey, KDS, cashier,
│   ├── fixtures/                    #   RTL snapshot suite; runs against emulators
│   └── customer-order.spec.ts
│
├── .github/workflows/
│   ├── ci.yml                       # lint, typecheck, unit tests (turbo-cached), i18n key check
│   ├── preview.yml                  # PR → Firebase Hosting preview channel
│   └── deploy.yml                   # main → staging; tag → prod (rules, functions, hosting)
│
└── docs/                            # these specification documents (01–10)
```

## Testing layout

- **Unit/component**: Vitest + Testing Library, colocated `*.test.tsx` next to source (packages/ui, features/).
- **Functions**: Vitest against `firebase-functions-test` + Firestore emulator (`functions/src/**/*.test.ts`).
- **Rules**: `@firebase/rules-unit-testing` suite in `firestore.rules.test.ts` (every role × every collection).
- **E2E**: Playwright in `/e2e`, seeded emulator data, projects: `mobile-ar-rtl`, `mobile-en`, `desktop`.
- **Visual**: Storybook + Chromatic (or Playwright screenshots) per theme × direction.

## Migration note — mapping the current repo

Current MVP (single Next.js app, Prisma + custom server, inline styles) maps as follows:

| Current | Target |
|---|---|
| `src/app/r/[slug]/[tableToken]/` (customer QR page) | `apps/web/src/app/(customer)/r/[slug]/[tableToken]/` — split monolithic page into landing/chat/menu/cart/orders routes |
| `src/app/(dashboard)/kitchen` `/waiter` `/manager` `/admin` | `(staff)/kitchen`, `(staff)/waiter`, `(management)/dashboard`, `(platform)/admin` |
| `src/app/(auth)/login`, `/change-password` | `(staff)/login` + Firebase Auth (replaces custom auth) |
| `src/app/api/auth/*` (custom sessions) | removed — Firebase Auth + custom claims; middleware guards |
| `src/app/api/orders`, `tables`, `menu`, `waiter-requests`, `feedback`, `knowledge`, `analytics` | direct Firestore client reads w/ security rules + Cloud Functions for privileged writes; thin `api/` kept only for webhooks |
| `src/app/api/ai/chat/route.ts` | kept as route handler, logic extracted to `packages/ai` |
| `prisma/` schema | translated to Firestore collections (`@tt/types` is the contract); one-time migration script in `scripts/migrate-prisma-to-firestore.ts` |
| `server.js` / `server.ts` (custom server, likely websockets) | removed — Firestore realtime listeners replace socket layer; FCM for push |
| Inline styles in dashboards | TailwindCSS + `@tt/ui` components |

Migration order: (1) extract `@tt/types` + `@tt/ui` tokens, (2) introduce Firebase alongside Prisma behind a repo interface, (3) move realtime surfaces (KDS/waiter) to Firestore listeners, (4) cut auth over, (5) delete custom server + Prisma.
