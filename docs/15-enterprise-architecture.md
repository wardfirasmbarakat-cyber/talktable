# 15 — Enterprise Architecture

**Firefly X TalkTable — Enterprise-Scale Architecture Specification (Phase 5 target, with phased applicability)**

Document owner: CTO · Companion docs: 11 (deployment), 12 (roadmap). This document specifies how TalkTable serves chains, franchises, and 500+ venues with contractual reliability, isolation, and compliance — and records the eight foundational architecture decisions as ADRs (§11).

---

## 1. Multi-Region Deployment

**Topology:**
- **Primary region:** Frankfurt (`europe-west3` Firebase/GCP + Vercel `fra1`) — 55–75 ms from Amman (latency analysis: doc 11 §2.2).
- **Residency region:** Dammam (`me-central2`) for GCC tenants requiring in-Kingdom/GCC data residency.
- **DR pair:** Zurich (`europe-west6`) cold-restorable from 6-hour exports (doc 11 §5).
- **Edge everywhere:** Vercel edge network serves static shells, menu ISR pages, and edge middleware (token validation, tenant routing, locale) from the PoP nearest the diner regardless of backend region.

**Cell architecture (region = cell):** each region is a self-contained cell — its own Firebase project, Functions, Storage, billing-ledger partition, and Stripe webhook endpoints. A tenant lives in exactly one cell (no cross-region replication of tenant data — this is a residency feature, not a limitation). The **global control plane** (tenant directory, routing map, feature flags, platform admin) lives in Frankfurt with read replicas cached at the edge (KV) so request routing never crosses regions twice.

**Routing:** edge middleware resolves `restaurantSlug → {cellRegion, projectId}` from the cached tenant directory (60 s TTL, purge-on-write) and pins all API calls for that request to the tenant's cell. Staff dashboards and diner sessions are therefore always single-region after the first hop.

**Failure domains:** a cell outage affects only its tenants; control-plane outage degrades to cached routing (existing sessions unaffected for hours). Cross-cell blast radius is limited to the platform admin and signup flows.

---## 2. Tenant Isolation Guarantees

Layered defense; every layer independently sufficient to stop cross-tenant reads:

1. **Identity claims:** every authenticated principal (staff via Firebase Auth custom claims; diner via signed table token) carries `orgId`, `branchIds[]`, `role`. Claims are minted only by the control plane, never client-settable.
2. **Firestore security rules:** all tenant data lives under `orgs/{orgId}/...`; rules require `request.auth.token.orgId == orgId` plus role/branch checks for writes. Rules are unit-tested in CI (doc 11 §7) with an adversarial test suite (every collection × every foreign-tenant principal must deny).
3. **API layer guards:** server routes re-derive tenant scope from verified claims, never from request bodies; a lint rule forbids raw collection access outside the `tenantDb(orgId)` accessor.
4. **Billing/ledger isolation:** ledger entries are written only by trusted Functions (no client write path exists at the rules level), keyed by orderId idempotency.
5. **Storage isolation:** per-org Storage prefixes with rules mirroring Firestore; signed URLs are short-lived (15 min).
6. **Operational isolation:** per-tenant rate limits (AI calls, order writes) so one tenant's traffic spike or abuse cannot consume another's latency budget (token-bucket per orgId at the edge); per-tenant AI budget caps with graceful degrade to menu-only mode.
7. **Verification:** quarterly automated cross-tenant penetration test (scripted attempts using real tenant credentials against other tenants' resources) with results in compliance evidence; any finding is a P1.
8. **Contractual guarantee (enterprise tier):** logical isolation per above; **dedicated Firebase project per tenant** available as a premium option (the cell router already supports per-tenant projectId, so "dedicated cell of one" is configuration, not engineering).

---

## 3. SLA Tiers

| | **Standard** (all paying venues) | **Enterprise** (chains, white-label) |
|---|---|---|
| Availability (monthly, service hours weighted) | 99.9% (≤ 43.8 min/mo downtime) | 99.95% (≤ 21.9 min/mo) |
| Scope of SLO | Order placement + kitchen receipt path | + AI assistant availability ≥ 99.5%, realtime propagation p95 ≤ 2 s |
| Support | In-app + WhatsApp, business hours, 8 h response | 24/7 P1 hotline, 30 min response, named TAM |
| Maintenance windows | 02:00–05:00 Asia/Amman, 72 h notice | Tenant-approved windows |
| Status page | Public (status.talktable.io) | + tenant-scoped status + webhook notifications |
| SLA credits | None (best effort beyond SLO) | 10% of monthly fees per 0.1% below SLO, cap 50% |
| RPO/RTO | doc 11 §5 (5 min / 1 h order data) | Same, contractually committed + annual DR drill report shared |

Measurement is third-party-verifiable: synthetic order journeys (doc 11 §4.1) from two probe locations define "down"; SLO dashboards are exported monthly per enterprise tenant. Error budgets gate releases: if a tier's budget is spent, only reliability changes deploy for that cell until recovered.

---

## 4. Data Residency Options

| Option | Tenant data location | Offered to | Notes |
|---|---|---|---|
| Default | Frankfurt (EU) | Everyone | GDPR-adequate hosting; Jordan PDPL permits transfer with safeguards (DPA + SCC-equivalent) |
| GCC residency | Dammam `me-central2` | Saudi/GCC enterprise | Meets common KSA data-localization expectations for commercial data; tenant pinned at creation |
| Dedicated project | Either region, single-tenant project | Enterprise premium | Own quotas, own keys (CMEK optional), own export bucket |

Constraints disclosed contractually: Anthropic API processing occurs in the provider's regions (US/EU) — prompts are PII-minimized (names/phones tokenized before leaving our boundary, ADR-007); Stripe data resides in Stripe's infrastructure (PCI scope, §8). Residency applies to the operational datastore, backups, exports, and logs (per-cell log buckets).

Migration between regions is supported as an offline operation: export → import → directory flip, executed in a maintenance window (target < 4 h for a 10-branch org), runbook tested annually.

---

## 5. White-Label Theming System

**Design-token architecture:** every visual decision in the diner surface and receipts resolves through a token set (`color.primary`, `color.surface`, `radius`, `font.family.{latin,arabic}`, `logo.{light,dark}`, `brand.name`, `ai.persona.{name,tone,greeting.{ar,en}}`). Tokens stored per org/branch in `orgs/{orgId}/theme`, validated against a Zod schema, with WCAG AA contrast auto-checking on save (we will not let a brand ship illegible buttons).

**Delivery:** tokens are injected as CSS custom properties at the edge (no rebuild per tenant — one codebase, runtime theming). Fonts limited to a curated, Arabic-capable allowlist (self-hosted, no third-party font calls — performance budget doc 11 §6 still applies to themed tenants). Email/receipt/PDF templates consume the same tokens.

**Custom domains:** `order.brandname.com` provisioned via Vercel Domains API; edge middleware maps host → orgId before slug routing; automatic TLS; the TalkTable name disappears entirely on enterprise white-label (footer attribution configurable by contract).

**AI persona theming:** persona name, tone guide, and greeting are part of the theme; injected into the system prompt within guardrails (persona may restyle, never override safety/accuracy/grounding instructions — enforced by prompt assembly order and eval suite).

**Tiers:** Standard = logo + primary color; Enterprise = full token set + domain + persona + receipt branding + branded QR print kit generator.

---

## 6. POS / ERP Integration Layer

**Philosophy (ADR-004):** TalkTable does not demand POS replacement. Integration modes: (a) **standalone** (TalkTable is the order system — SMB default), (b) **passthrough** (TalkTable captures diner orders and pushes them into the incumbent POS, which remains fiscal system of record), (c) **sync** (menu/price pulled from POS, orders pushed back).

### 6.1 REST API v1 (outline; full OpenAPI spec ships in Phase 5 S19)

Base: `https://api.talktable.io/v1` · Auth: per-tenant API keys (`Authorization: Bearer tt_live_…`) with scopes (`menu:read`, `orders:read`, `orders:write`, `customers:read`, `webhooks:manage`) · Versioning: URL-versioned, additive-only within v1, 12-month deprecation policy · Rate limits: 600 req/min/tenant standard, headers `X-RateLimit-*` · Idempotency: `Idempotency-Key` header honored on all POSTs · Pagination: cursor-based.

| Resource | Endpoints |
|---|---|
| Menus | `GET /branches/{id}/menu` (full tree), `PUT /branches/{id}/menu/items/{itemId}` (price/availability sync from POS), `POST /branches/{id}/menu/import` (bulk) |
| Orders | `GET /orders?branch&status&since`, `GET /orders/{id}` (items, statuses, payment state, timestamps), `POST /orders/{id}/status` (POS acknowledges/advances in passthrough), `POST /orders` (POS-originated orders for unified reporting) |
| Customers | `GET /customers/{id}`, `GET /customers?phone=` (consent-gated fields only) |
| Billing | `GET /billing/ledger?month=` (the tenant's own usage — transparency API) |
| Webhooks | `POST/GET/DELETE /webhooks` (subscriptions) |

### 6.2 Webhooks

Events: `order.created`, `order.updated`, `order.completed`, `order.cancelled`, `payment.captured`, `payment.refunded`, `feedback.created`, `waiter_request.created`, `menu.updated`.

Contract: JSON envelope `{id, type, createdAt, orgId, branchId, data, apiVersion}`; HMAC-SHA256 signature header (`TT-Signature: t=…,v1=…`, 5-min replay window); at-least-once delivery, exponential retries over 24 h (consumers must be idempotent on event `id`); dead-letter visibility + manual replay in the tenant dashboard; per-endpoint health metrics with auto-disable after 3 days of total failure (with notifications).

**First-party connectors (Phase 5 S23):** Foodics export-format compatibility, accounting CSV/QuickBooks export, generic KDS passthrough. Connector framework runs as isolated Cloud Functions per tenant config — a broken connector never blocks order flow (queue with circuit breaker).

---

## 7. Enterprise Identity: SSO & Advanced RBAC

### 7.1 SSO
- **OIDC** (first): Google Workspace / Microsoft Entra for chain HQ staff; per-org IdP config (issuer, clientId), domain-verified; JIT user provisioning with default role mapping from IdP groups.
- **SAML 2.0** (second): for enterprises that require it; SP-initiated, signed assertions, per-org metadata.
- **SCIM-lite:** create/deactivate users + group→role sync, so a fired area manager loses access at the IdP, instantly.
- Floor staff on shared tablets keep lightweight auth (device-bound sessions + PIN switch between staff identities) — SSO is for management tiers; both paths converge on the same claims model (§2).
- Session policies per org: max session length, device limits, re-auth for sensitive actions (refunds, billing, user management), mandatory hardware-key 2FA for platform-admin and org-owner roles.

### 7.2 Advanced RBAC

Built-in roles (Phase 1–3): `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`. Phase 5 adds **custom roles**:

- A role = named set of permissions from a fixed catalog of ~40 granular permissions (`menu.edit`, `menu.price.edit`, `orders.refund`, `analytics.view`, `analytics.financial.view`, `crm.export`, `billing.view`, `staff.manage`, `settings.edit`, `ai.knowledge.edit`, …).
- **Per-branch scoping:** assignment = (user, role, branch-set | org-wide). An "Area Manager – North Amman" sees exactly her three branches; a franchise owner sees his branches but not the franchisor's chain-wide CRM export.
- Resolution: permissions are compiled into the auth claims at assignment time (claims size-bounded; overflow falls back to a server-side permission check with 5-min cache). Deny-by-default; no permission ever inferred.
- Separation-of-duties guards: `billing.adjust` and `billing.approve` cannot be held by the same custom role; refunds above threshold require second approval.
- Full audit: every permission grant/revoke and every use of sensitive permissions lands in the immutable audit log (extends the existing `AuditLog` model), exportable per tenant for their own compliance.

---

## 8. Compliance Roadmap

| Framework | Scope/strategy | Timeline |
|---|---|---|
| **PCI-DSS** | Keep scope **SAQ-A permanently**: all card data entered into Stripe Elements/Checkout (Stripe-hosted fields); PAN never touches TalkTable servers, logs, or DB; payment methods stored as Stripe tokens only. Annual SAQ-A attestation + ASV scan of public endpoints. Any feature that would expand scope (e.g., storing cards ourselves) is architecturally banned. | From Phase 2 payments launch; attestation annually |
| **SOC 2 Type II** | Trust criteria: Security + Availability (+ Confidentiality at customer demand). Automation platform (Vanta/Drata-class) from M9; controls largely fall out of existing practice: change management = PR + CI evidence (doc 11 §3), access reviews quarterly (automated), vendor register, IR plan + tested postmortems (doc 11 §4.4), encryption at rest/in transit (platform default + CMEK option), backups + DR drills (doc 11 §5). | Gap assessment M9 → Type I ~M12 → 3-month observation → **Type II report ~M15** |
| **GDPR** | EU hosting default; applies where EU data subjects dine. Lawful bases mapped (contract for ordering, consent for CRM/marketing), DPAs with subprocessors (GCP, Vercel, Anthropic, Stripe, Twilio), records of processing, DPIA for AI conversation processing, data-subject tooling: export + delete per customer (Phase 5 S22), retention policy (chat transcripts 13 months PII-redacted at 30 days; orders 7 years for tax). | DPA pack Phase 3 (CRM launch); DSR tooling Phase 5 |
| **Jordan PDPL (Law No. 24 of 2023)** | Jordan's data protection law (enforcement maturing): register processing where required, consent for marketing (the CRM opt-in flow, doc 12 E3.2, is consent-first by design), breach notification procedure (72 h target), cross-border transfer safeguards documented for Frankfurt hosting, Arabic-language privacy notice at the QR entry point. | Privacy notice + consent flows at Phase 3; full PDPL file with counsel by M8 |
| AI governance | Model/provider register, prompt-injection test suite in CI, AI-output disclaimers for allergen answers ("confirm with staff" for medical-grade claims), human-override path always present, transcript PII redaction (ADR-007). | Continuous from Phase 2 |

---

## 9. Capacity Planning Math

**Unit of load: 1,000 concurrent diners** (≈ 25–35 busy venues at peak, ~40 tables each at ~70% occupancy with ~1 active device/table).

Per-diner behavior model (peak hour): 1 order placed / 1.5 diners (≈ 0.67 orders), 3 AI exchanges, 25 menu reads (mostly edge/ISR-cached, ~80% never reach Firestore), order doc + 4 status transitions + 4 listener fan-outs to ~3 dashboards.

**Firestore ops per 1,000 concurrent diners (peak hour):**

| Source | Math | Ops/hour | Ops/sec |
|---|---|---|---|
| Menu/knowledge reads (cache misses 20%) | 1,000 × 25 × 0.2 | 5,000 reads | 1.4 |
| Order writes (create + 4 transitions + items subwrites ≈ 9 writes/order) | 670 orders × 9 | 6,030 writes | 1.7 |
| Listener reads (3 dashboards × 5 events/order) | 670 × 15 | 10,050 reads | 2.8 |
| AI context reads (grounding fetch, cached 70%) | 1,000 × 3 × 0.3 × 4 docs | 3,600 reads | 1.0 |
| Waiter requests + feedback + CRM | ~ | 2,500 mixed | 0.7 |
| **Total** | | ~27k ops/h | **~7.6 ops/sec** |

**Implication:** Firestore's practical headroom (≥10k writes/sec/database, soft-limitless reads) means **even 100k concurrent diners (~3,000 peak venues) ≈ 760 ops/sec** — two orders of magnitude inside platform limits. The real constraints are different and are what we engineer for:
- **Hot documents:** per-branch counters (live order counts, billing meters) must be sharded or computed from queries — no single doc may take >1 sustained write/sec.
- **Listener fan-out:** dashboards subscribe to narrow queries (`status in [active]` per branch), not whole collections; ~5 listeners/venue × 500 venues = 2.5k concurrent listeners — well inside the 1M-connections class limits, but reconnection storms after network blips are the load-test target (doc 11 §6.2 S4).
- **Functions concurrency:** AI orchestration at 1,000 concurrent diners ≈ 50 concurrent chat requests (3 exchanges × ~20 s spread) — min-instances=5 on the chat function kills cold starts; Anthropic rate limits (not our infra) are the scaling bottleneck → provider tier raises tracked as a capacity item.
- **BigQuery ingestion** (Phase 4): ~10 events/order × 670 orders/h/kilo-diner — trivial via streaming inserts.

Capacity reviews quarterly: measured ops/diner recalibrate this model; alerts fire at 70% of planned capacity (doc 11 §4.3).

### 10. Cost-at-Scale Model

Monthly platform cost at three scales (assumes 26 operating days, venue averaging 110 billable orders/day mature):

| Cost line | 50 venues (~143k orders/mo) | 200 venues (~572k) | 500 venues (~1.43M) |
|---|---|---|---|
| AI (chat+voice, cached, model-routed) ~0.014 JOD/order | $2,800 | $11,300 | $28,200 |
| Firestore (ops + storage, from §9 model) | $250 | $900 | $2,100 |
| Cloud Functions + networking | $200 | $700 | $1,600 |
| Vercel (Pro→Enterprise) | $150 | $1,500 | $3,500 |
| BigQuery + monitoring + Sentry + logs | $300 | $900 | $2,000 |
| Stripe billing-rail fees (on our invoices, ~2.9%+30¢) | $650 | $2,500 | $6,100 |
| Comms (FCM free; WhatsApp/SMS) | $300 | $1,100 | $2,700 |
| **Total COGS** | **$4,650** | **$18,900** | **$46,200** |
| Revenue (orders × 0.10 JOD × 1.41) | $20,160 | $80,650 | $201,600 |
| **Gross margin** | **77%** | **77%** | **77%** |

COGS per order is flat (~$0.032) because the dominant line (AI) is per-order variable; fixed lines amortize. Margin expansion levers tracked monthly: prompt-cache hit rate (target ≥70%), cheap-model routing share (target ≥40% of turns), voice STT cost curve. Enterprise dedicated projects add ~$300–800/mo/tenant, priced into the enterprise tier.

---

## 11. Architectural Decision Records

Format: Context → Decision → Consequences. Status of all eight: **Accepted.**

### ADR-001: Firestore vs PostgreSQL as the operational datastore
- **Context:** Phase 1 runs Prisma/PostgreSQL (Neon) — excellent relational fit for menus/orders, but realtime requires a stateful Socket.io server, and multi-tenant scaling means connection pools, read replicas, and ops burden a 5-person team can't carry alongside product work.
- **Decision:** Migrate the operational store to Firestore (Phase 3): native realtime listeners, security rules as a second isolation layer, serverless scaling matched to spiky restaurant traffic, regional choice incl. `me-central2`. PostgreSQL/BigQuery remain for analytics (E4.4) where relational/columnar wins.
- **Consequences:** (+) zero-ops realtime, per-tenant rules, offline SDK for flaky restaurant Wi-Fi. (−) lose joins/transactions ergonomics → denormalized order documents, ledger discipline (ADR-006), composite-index management; analytics must leave Firestore (accepted: BigQuery pipeline). Migration cost is paid once, in a dual-write window (doc 12 E3.5).

### ADR-002: Firestore listeners vs Socket.io for realtime
- **Context:** MVP's Socket.io demands a long-lived Node process (`server.ts`); on Vercel serverless this degrades to polling, and horizontal scale needs sticky sessions/Redis adapter — an ops tax with no product payoff.
- **Decision:** Replace Socket.io with Firestore `onSnapshot` queries per dashboard; FCM push for backgrounded devices.
- **Consequences:** (+) statelessness restores pure-serverless deploys, reconnection/offline handled by SDK, fan-out scales with no broker. (−) listener read costs (modeled §9 — negligible), 100–500 ms extra propagation vs raw sockets (within the 2 s budget), vendor coupling (accepted; mitigated by event-stream export to BigQuery for portability).

### ADR-003: Usage-based billing ledger design (append-only)
- **Context:** Revenue = 0.10 JOD × completed orders. Any double-charge or missed charge is an existential trust failure; mutable balance fields are unauditable.
- **Decision:** Append-only `billing_ledger`: one immutable entry per completed order, idempotency key = orderId, written by a single trusted Function on the status transition; corrections are reversal entries, never edits. Invoices are pure deterministic folds over the ledger; Stripe is a payment rail, never the source of truth. Daily three-way reconciliation (orders == ledger == invoice lines) with zero-tolerance alerting.
- **Consequences:** (+) replayable, auditable, dispute-resolvable from first principles; idempotent month-end jobs. (−) reads require aggregation (mitigated: sharded monthly rollup docs, recomputable); discipline required that no code path ever bypasses the writer Function (enforced by security rules: clients cannot write the collection at all).

### ADR-004: Coexist with incumbent POS (passthrough) vs replace it
- **Context:** Chains will not rip out fiscal POS systems for a startup; demanding replacement caps us at greenfield SMBs.
- **Decision:** TalkTable owns the diner conversation and order capture; integration layer (§6) pushes orders into incumbent POS where present. POS replacement is an outcome we earn, not a precondition.
- **Consequences:** (+) enterprise wedge, shorter sales cycles, incumbents become integration partners; (−) connector maintenance surface, "system of record" ambiguity handled contractually per deployment mode; some revenue (payments) deferred where POS keeps settlement.

### ADR-005: AI provider abstraction layer
- **Context:** Today the chat route calls the Anthropic Messages API directly (`/api/ai/chat`). Voice, cost-routing, and enterprise procurement all demand flexibility; model pricing/quality shifts quarterly.
- **Decision:** Introduce an internal `AIGateway` interface (chat, transcribe, embed) with provider adapters; Anthropic remains the default reasoning provider. Gateway owns: prompt assembly order (safety > grounding > persona), prompt caching, per-tenant budget enforcement, token/cost ledgering, model routing rules (FAQ-class turns → small model), eval-harness hooks, and PII tokenization before any external call.
- **Consequences:** (+) cost levers and provider negotiations without product rewrites; uniform observability; per-tenant model pinning for enterprise. (−) abstraction maintenance; lowest-common-denominator risk (mitigated: capability flags per provider rather than restricting to the intersection).

### ADR-006: Diner identity = table token + optional phone OTP (no diner accounts)
- **Context:** Forcing signup at the table kills conversion; but CRM/loyalty needs durable identity.
- **Decision:** Anonymous-by-default signed table tokens (existing `/r/[slug]/[tableToken]` model) for ordering; **optional** phone-OTP linkage for loyalty/CRM, consent-first (PDPL/GDPR). Customer identity is org-scoped (no cross-org diner graph) by policy.
- **Consequences:** (+) zero-friction ordering preserved, privacy posture defensible, loyalty becomes a value exchange not a toll. (−) unidentified diners fragment CRM data (accepted; loyalty incentive drives ~15%+ identification, doc 12 E3.2); table-token security must be strong (signed, rotatable per service period, rate-limited).

### ADR-007: LLM never touches raw data or raw SQL — governed tools only
- **Context:** Phase 4 analytics chat and AI Briefings could naïvely give the model database access; hallucinated numbers or injected prompts against raw data are unacceptable in a product that bills money and reports revenue to owners.
- **Decision:** All AI analytics flow through a governed metrics layer (named, tested dbt metrics exposed as tool functions with typed parameters). The LLM selects and narrates; it never computes business numbers, never sees raw PII (tokenized upstream), and forecasting is classical ML with the LLM as narrator only.
- **Consequences:** (+) numbers in AI Briefings are exactly the dashboard's numbers — trust preserved; injection blast radius limited to tool-call selection; auditability of every figure. (−) metrics-layer development cost; "ask anything" is bounded by the metric catalog (accepted — catalog grows with demand).

### ADR-008: Payment provider abstraction (Stripe-first, local PSP-ready)
- **Context:** Stripe has no direct JOD merchant settlement; Jordan/GCC restaurants may require local PSPs (HyperPay, Telr, regional acquirers), and platform billing (our invoices) vs diner payments (restaurant's money) are distinct flows with distinct providers possibly.
- **Decision:** A `PaymentProvider` interface (intent, capture, refund, webhook-normalization) ships with the first payment feature (doc 12 S1). Stripe implements it first for both flows; local PSP adapters slot in per-market without touching order/billing logic. PCI scope stays SAQ-A across all adapters (hosted fields only — a hard architectural rule, §8).
- **Consequences:** (+) market entry (KSA) is an adapter, not a rewrite; platform billing decoupled from diner payments; (−) interface must be conservative (lowest-risk feature set first: card, wallet, refund); per-provider webhook semantics normalized behind one internal event schema.

---

## 12. Standing Architectural Principles

1. **Diner ordering must survive every dependency failure** — AI down → menu-tap mode; realtime down → polling; payments down → cash flow. Degradation paths are tested in chaos drills (doc 11 §6.2 S6).
2. **Money paths are boring:** append-only, idempotent, reconciled daily, two-reviewer changes.
3. **One codebase, runtime tenancy:** white-label, residency, and dedicated projects are configuration over the same artifact — no per-tenant forks, ever.
4. **Every figure shown to an owner is recomputable** from the event stream; every AI claim is grounded in a retrievable source.
5. **Latency budgets are contracts** (doc 11 §6) and apply equally to themed enterprise tenants.
