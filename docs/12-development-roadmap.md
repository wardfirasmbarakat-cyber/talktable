# 12 — Development Roadmap (12 Months)

**Firefly X TalkTable — Engineering Roadmap, Phases 1–5**

Document owner: CTO · Cadence: 2-week sprints · Suggested core team: 5 (1 tech lead/full-stack, 2 full-stack engineers, 1 AI/ML engineer, 1 product designer with front-end skills) growing to 8 by Phase 5. Months are relative to roadmap start ("M1" = first month after pilot kickoff, aligned with doc 13).

---

## Phase 1 — DONE: Current MVP (shipped, live)

What exists **today in this repo** and on the live deployment (https://talktable-inky.vercel.app):

**Stack:** Next.js 15 (App Router) + custom Node `server.ts` with Socket.io, Prisma ORM on PostgreSQL (Neon), JWT sessions (`jose`) with argon2 password hashing, Zod validation, Anthropic Messages API for AI chat, deployed on Vercel.

**Customer surface — `/r/[slug]/[tableToken]`:**
- QR-scan landing per table (token-scoped, no login required)
- Bilingual menu browsing by category with item details, allergens, ingredients
- AI chat ordering assistant (`/api/ai/chat`) grounded in the restaurant's menu + knowledge base, last-10-message context window, can build a cart and answer dish/allergen/policy questions
- Cart → order placement (`/api/orders`), live order status, call-waiter requests (`/api/waiter-requests`) with typed request reasons
- Post-meal feedback capture (`/api/feedback`)

**Staff surfaces (role-gated dashboards under `(dashboard)`):**
- **Kitchen:** live incoming orders, status pipeline (order status enum + `OrderStatusHistory` audit trail), accept/prepare/ready transitions over Socket.io realtime
- **Waiter:** table call queue with request types and resolution states, order delivery confirmation
- **Manager:** menu CRUD (categories, items, allergens, ingredients), inventory items, AI knowledge-base items, feedback review, analytics (`/api/analytics`), table/QR management (`/api/tables`)
- **Admin:** user management (`/api/users`) with `Role` enum, restaurant settings, audit log (`AuditLog` model with `AuditAction` enum)

**Data model (Prisma):** `Restaurant`, `RestaurantSettings`, `User`, `Session`, `Table`, `Category`, `MenuItem`, `Allergen`, `MenuItemAllergen`, `MenuItemIngredient`, `Order`, `OrderItem`, `OrderStatusHistory`, `WaiterRequest`, `Feedback`, `InventoryItem`, `KnowledgeItem`, `AuditLog`. Seed script provides a complete demo restaurant with demo accounts.

**Known Phase-1 limitations (deliberate):** single restaurant per deployment mindset (schema is restaurant-scoped but no multi-branch grouping), Socket.io requires the stateful server (degrades on pure serverless), no payments, no billing engine, Arabic support partial (content fields exist; RTL UI incomplete), no offline/PWA install, no automated tests beyond manual QA.

---

## Phase 2 — Months 1–2: Voice AI, Payments, Feedback Loop, PWA, Arabic

**Goals:** Make the diner experience feel magical and complete (voice + pay-at-table), close the loop on feedback, and make the product genuinely bilingual — all on the existing Postgres stack while the pilot (doc 13) runs in parallel.

### Epics & user stories

**E2.1 — Voice AI ordering** *(AI engineer + 1 FS engineer)*
- As a diner, I tap a mic button and speak my order in Arabic (Jordanian dialect) or English and see a live transcript.
- As a diner, the AI confirms my order verbally and visually before adding to cart.
- As a restaurant, voice falls back to text chat seamlessly when the room is loud or STT confidence is low.
- Technical stories: streaming STT (browser Web Speech API baseline + server-side Whisper-class fallback for Arabic), intent pipeline reusing the existing `/api/ai/chat` grounding, TTS responses (optional, default off), confidence thresholds + human-handoff event, voice analytics events.

**E2.2 — Payments** *(1 FS engineer + tech lead)*
- As a diner, I pay my bill from my phone (Stripe Payment Element: cards, Apple/Google Pay) or select "pay cash" which notifies the waiter.
- As a waiter, I see payment status per table and can mark cash collected.
- As a manager, I see settled vs unsettled orders and end-of-day cash reconciliation report.
- Technical stories: `Payment` model + state machine (pending → authorized → captured/cash_collected → refunded), Stripe webhooks with signature verification + idempotency keys, split-bill v1 (equal split), receipt via SMS/WhatsApp link, refund flow with manager PIN.

**E2.3 — Feedback loop v2** *(designer + FS engineer)*
- As a diner, I get a 2-tap feedback prompt after payment (rating + optional voice/text comment, AI-summarized).
- As a manager, negative feedback (≤2 stars) triggers an instant alert so I can recover the table before they leave.
- AI weekly digest: themes extracted from feedback + chat transcripts ("12 diners asked for oat milk").

**E2.4 — PWA polish** *(designer + FS engineer)*
- Installable PWA for staff dashboards (kitchen tablets boot straight into kitchen view), offline shell for diner menu (browse cached menu when Wi-Fi blips; ordering queues and retries), push notifications (FCM) for waiter calls when app backgrounded, sound + vibration alerts in kitchen.

**E2.5 — Arabic RTL completion** *(designer + all)*
- Full RTL layout audit (logical CSS properties everywhere), Arabic-first content entry for menu/knowledge (every text field `ar`/`en` pair with fallback), AI system prompt localization + dialect tone guide, number/currency formatting (JOD, Arabic-Indic digits optional), language toggle persistence.

**E2.6 — Engineering hygiene (cross-cutting)** *(tech lead)*
- Vitest + Playwright suites and the CI pipelines from doc 11 §3, Sentry, structured logging, rate limiting on AI + auth routes, the AI usage ledger (token/cost per request — feeds doc 13 unit economics).

### Team allocation (5 people)
| Person | Allocation |
|---|---|
| Tech lead | E2.2 payments core, E2.6, code review |
| FS engineer A | E2.2 UI + waiter flows, E2.4 |
| FS engineer B | E2.1 integration, E2.3 |
| AI engineer | E2.1 pipeline, E2.3 AI digest, prompt eval harness |
| Designer/FE | E2.4, E2.5, feedback UX |

### Sprint breakdown (4 sprints)
- **S1 (M1.1):** CI/test foundation, Sentry, AI usage ledger; Stripe sandbox integration spike; voice STT spike (Arabic accuracy benchmark — go/no-go on browser vs server STT); RTL audit.
- **S2 (M1.2):** Payment model + card flow end-to-end in staging; voice text-pipeline (speak → transcript → existing chat); PWA manifest + install flows; RTL fixes batch 1.
- **S3 (M2.1):** Cash flow + reconciliation report; voice confirmation UX + fallbacks; feedback v2 + manager alerts; push notifications.
- **S4 (M2.2):** Refunds, split bill, receipts; voice hardening in real noise (on-site testing at pilot restaurant); AI weekly digest; RTL completion + Arabic QA pass; load test S1–S3 scenarios (doc 11 §6.2).

**Dependencies:** Stripe account + Jordan payout path confirmed (Stripe has no direct JOD merchant settlement — decide: Stripe with USD settlement vs local PSP (e.g., HyperPay/Telr) adapter behind a `PaymentProvider` interface; the interface ships in S1 regardless). Anthropic rate limits raised for production key. Pilot restaurant access for on-site voice testing.

**Risks:** Arabic dialect STT accuracy (mitigate: confidence-gated fallback to text, collect transcripts for evaluation set); Stripe geo constraints (mitigate: provider abstraction, ADR-008); voice scope creep (mitigate: TTS optional, dialect tuning is iterative not blocking).

**Exit criteria:** Diner can complete the full journey speak → order → eat → pay → feedback at the pilot restaurant; ≥95% payment webhook reliability over 2 weeks; Arabic UI passes native-speaker QA checklist; PWA installed on all pilot staff devices; test coverage ≥60% on API routes; all P1 alerts from doc 11 wired.

---

## Phase 3 — Months 3–5: Multi-Branch, CRM + Loyalty, Billing Engine, Cashier

**Goals:** Turn a single-restaurant tool into a multi-tenant business platform that bills itself. This phase also begins the Firebase migration (data layer first) because multi-branch realtime fan-out is where Firestore listeners pay off (ADR-001/002, doc 15).

### Epics & user stories

**E3.1 — Multi-branch / organization model**
- As an owner, I create an Organization containing multiple branches (restaurants), each with its own menu (optionally inherited from an org master menu with branch overrides), staff, tables, and settings.
- As an area manager, I switch branches from one login and see cross-branch comparison analytics.
- As a staff member, my role is scoped per branch (waiter at Branch A only).
- Technical: `Organization → Branch(Restaurant) → ...` hierarchy, org-level vs branch-level RBAC claims, menu inheritance/override resolution, branch-scoped Firestore security rules, data migration script from current flat schema.

**E3.2 — CRM + loyalty**
- As a diner, I optionally identify via phone number (OTP) and earn points per JOD spent; returning diners are greeted by name by the AI with their usual order suggested.
- As a manager, I see customer profiles: visits, lifetime value, favorite items, allergies remembered, feedback history.
- As a marketer, I create simple campaigns (e.g., "10% off for customers inactive 30 days") delivered via WhatsApp/SMS with opt-in compliance.
- Technical: `Customer` identity unified across branches within an org, consent records (PDPL-aligned, doc 15 §8), points ledger (same append-only pattern as billing), segmentation queries, WhatsApp Business API integration.

**E3.3 — Billing engine (the 0.10 JOD/order ledger)** *(highest-stakes epic — tech lead owns)*
- As TalkTable, every order that reaches `COMPLETED` writes an immutable `billing_ledger` entry (orderId, branchId, orgId, amount 0.100 JOD, timestamp, idempotency key = orderId).
- As an owner, I see a live "what you owe this month" meter and per-branch usage breakdown in the dashboard — total transparency.
- As TalkTable finance, on the 1st of each month an invoice per organization is generated from the ledger, charged automatically via saved payment method (Stripe), with dunning (retry day 3/7, service notice day 10, read-only mode day 14 — diners are never blocked, only manager analytics degrade) and VAT-compliant Jordan invoice PDF (16% sales tax line).
- Reconciliation job: count(completed orders) == count(ledger entries) == sum(invoice lines), daily, alert on drift (doc 11 §4.3).
- Technical: ledger is append-only with reversal entries (never updates), invoice generation idempotent, Stripe Billing with metered usage OR internal invoicing with Stripe one-off charges (ADR-006 decides: internal ledger is source of truth, Stripe is the payment rail only), credit notes for disputes, free-allowance flag for pilot restaurants.

**E3.4 — Cashier role**
- As a cashier, I have a dedicated POS-lite screen: open tables, take counter orders (walk-ins without QR), settle bills (cash/card), apply manager-approved discounts, X/Z end-of-day reports.
- Cashier actions fully audited (extends existing `AuditLog`).

**E3.5 — Firebase data-layer migration (infrastructure epic, runs across all sprints)**
- Dual-write window: Prisma/Postgres remains source of truth while Firestore mirrors orders/requests; dashboards switch to `onSnapshot` listeners (removing Socket.io); cutover per-collection with verification jobs; Postgres retained for analytics until Phase 4 BI store decision.

### Team allocation (6 — hire FS engineer C at M3)
| Person | Allocation |
|---|---|
| Tech lead | E3.3 billing engine, E3.5 architecture |
| FS engineer A | E3.1 multi-branch |
| FS engineer B | E3.4 cashier, E3.1 RBAC |
| FS engineer C (new) | E3.5 migration execution, dashboards |
| AI engineer | E3.2 AI personalization, CRM segmentation |
| Designer/FE | CRM/loyalty UX, cashier UX, owner billing transparency UI |

### Sprint breakdown (6 sprints)
- **S5 (M3.1):** Org/branch schema + migration design doc; ledger schema + write path behind flag; Firestore project setup + emulator workflow; OTP identity spike.
- **S6 (M3.2):** Branch switching + org RBAC; ledger live in shadow mode (writing, not billing); customer profiles v1; cashier wireframes.
- **S7 (M4.1):** Menu inheritance; invoice generation + PDF + Jordan tax fields; loyalty points ledger; orders dual-write to Firestore.
- **S8 (M4.2):** Auto-charge + dunning; AI greets returning customers; cashier order-taking + settlement; kitchen/waiter dashboards on Firestore listeners (Socket.io retired in staging).
- **S9 (M5.1):** Cross-branch analytics; campaigns v1 (WhatsApp); X/Z reports; reconciliation job + billing dashboards; production listener cutover.
- **S10 (M5.2):** Hardening sprint — billing end-to-end rehearsal with 3 real restaurants on free allowance, S5 load test (invoice month-end), security review of org isolation, migration cleanup.

**Dependencies:** Phase 2 payments live (billing auto-charge reuses payment methods); WhatsApp Business API approval (apply in M3 — 2–4 week lead time); legal review of invoice format + PDPL consent text; ≥3 onboarded restaurants to exercise multi-tenancy for real.

**Risks:** Billing correctness (mitigate: shadow mode for a full month before charging real money; append-only design; reconciliation alerts); migration regressions (mitigate: dual-write + per-collection cutover with diff verification); CRM privacy missteps (mitigate: consent-first design, legal review gate in S7); team onboarding drag (mitigate: engineer C starts on well-bounded migration tasks).

**Exit criteria:** First real auto-generated invoice paid by a non-pilot restaurant; reconciliation drift = 0 for 30 consecutive days; an org with ≥2 branches operating daily; Socket.io fully removed from production; cashier role used for ≥50% of walk-in orders at one site; loyalty enrollment ≥15% of diners at participating restaurants.

---

## Phase 4 — Months 6–8: AI Business Intelligence, Platform Admin, Self-Serve Onboarding

**Goals:** Shift the AI from front-of-house assistant to back-of-house brain, and remove founders from the onboarding loop so sales can scale.

### Epics & user stories

**E4.1 — AI Business Intelligence suite** *(AI engineer leads)*
- **Demand forecasting:** "Tomorrow you'll likely do 230 ± 30 orders; Thursday is trending 18% above your 4-week average." Inputs: own order history, day-of-week/seasonality, Jordan holidays/Ramadan calendar, weather. Baseline: gradient-boosted/Prophet-class models per branch; LLM only narrates, never predicts.
- **Inventory prediction:** consumption rates from `OrderItem → MenuItemIngredient` mapping → "You will run out of chicken breast Friday evening; suggested order: 24 kg." Waste tracking input + variance reports.
- **Menu optimization:** menu-engineering quadrant (popularity × margin), AI-suggested actions ("Item X: high views in chat, low orders — diners ask about spice level; consider description change"), price elasticity hints from item-level demand shifts, A/B description testing through the AI assistant.
- **Staffing suggestions:** forecasted covers → suggested floor staffing per shift; waiter response-time analytics per staff member (coaching, not surveillance — manager-only, aggregated defaults).
- Delivery surface: "Insights" tab + weekly AI Briefing (Arabic/English narrative with linked evidence) + ask-anything analytics chat for managers ("ما هو أكثر صنف مبيعاً يوم الجمعة؟") via tool-calling over a governed metrics layer (no raw SQL from the LLM — ADR-007).

**E4.2 — Platform admin panel (internal)**
- As TalkTable ops, I manage all tenants: create/suspend orgs, usage + revenue per tenant, AI cost per tenant, impersonation with consent + audit, feature-flag assignment, billing adjustments/credit notes, platform health overview (the dashboards from doc 11 embedded).
- Support tooling: order-event timeline viewer for "where is my order" tickets, AI conversation replay (PII-redacted).

**E4.3 — Self-serve restaurant onboarding**
- As a new restaurant owner, I sign up, and an AI onboarding agent builds my restaurant: upload menu (photo/PDF/Excel) → AI extracts items, prices, descriptions in both languages → owner reviews/edits → tables generated with printable QR PDF pack → knowledge base interview ("What are your opening hours? Do you deliver?") → staff invited by phone number → go live checklist.
- Target: signup → first live order in under 60 minutes without human help.
- Sales-assist mode: TalkTable agent can do it on the owner's behalf in 20 minutes on-site (the wedge for doc 13 expansion).

**E4.4 — Analytics data platform (enabler)**
- Event stream (order events, chat events, payments) → BigQuery; dbt models for the metrics layer; this is what E4.1 and investor KPIs (doc 14) read from. Postgres analytics retired.

### Team allocation (7 — hire data engineer at M6)
| Person | Allocation |
|---|---|
| Tech lead | E4.2, platform architecture, ADRs |
| FS engineer A | E4.3 onboarding flows |
| FS engineer B | E4.2 internal tools |
| FS engineer C | E4.1 surfaces (Insights tab) |
| AI engineer | E4.1 models + menu extraction, eval harness |
| Data engineer (new) | E4.4, forecasting pipelines |
| Designer/FE | Onboarding UX, Insights UX, QR print kit |

### Sprint breakdown (6 sprints)
- **S11:** BigQuery pipeline + core dbt models; admin panel skeleton + tenant list; menu-extraction prototype (accuracy benchmark on 20 real Jordanian menus).
- **S12:** Forecasting v1 (backtested MAPE target <20% on pilot data); admin usage/revenue views; onboarding signup + menu import.
- **S13:** Inventory prediction v1; impersonation + audit; QR pack + knowledge interview; weekly AI Briefing (English).
- **S14:** Menu optimization quadrant + suggestions; feature flags per tenant; staff invites + go-live checklist; Briefing in Arabic.
- **S15:** Staffing suggestions; analytics chat (tool-calling, governed metrics); billing adjustments tooling; onboarding end-to-end dry runs with 3 strangers (usability test).
- **S16:** Hardening — forecast accuracy review vs backtests, admin security review (it's the most dangerous surface — SSO + hardware-key 2FA mandatory), self-serve launch.

**Dependencies:** ≥6 months of order data from ≥10 restaurants for credible forecasting (pipeline from Phase 3 traction); BigQuery cost guardrails; menu-extraction needs a labeled evaluation set built in S11.

**Risks:** Forecast credibility — one bad confident prediction destroys trust (mitigate: always show confidence ranges + "based on your last N weeks", backtest gates before any model ships); admin panel as attack surface (mitigate: separate auth realm, IP allowlist, full audit); onboarding extraction accuracy on photographed Arabic menus (mitigate: human-review step is mandatory, never auto-publish).

**Exit criteria:** ≥3 restaurants self-onboard with zero human help; forecast MAPE <20% on next-day covers for mature tenants; ≥40% weekly active usage of Insights tab among managers; platform admin handles 100% of support workflows that previously required DB access; founders no longer in the onboarding loop.

---

## Phase 5 — Months 9–12: Enterprise Scale, White-Label, POS API, SOC 2 Prep

**Goals:** Win chains. Everything here is detailed architecturally in doc 15; this phase executes it.

### Epics & user stories

**E5.1 — Enterprise scale & reliability**
- Multi-region capability (Frankfurt primary, Dammam residency option), SLA tiering (99.9% standard / 99.95% enterprise) with status page + SLA credits, capacity plan executed for 500 restaurants / 25k concurrent diners (doc 15 §9), rate-limiting and tenant noisy-neighbor isolation, S1–S6 load tests at 100× (doc 11 §6.2).

**E5.2 — White-label**
- As a chain, the diner app carries my brand: logo, colors, fonts, custom domain (`order.fireflyburger.com`), branded receipts and AI persona name/tone. Theming token system, per-tenant domain provisioning (Vercel domains API), app-store-less distribution via branded PWA.

**E5.3 — Public API + POS/ERP integrations**
- REST API v1 (OpenAPI spec): menus, orders, customers, webhooks (order.created/updated/completed, payment.captured, feedback.created) with HMAC signatures and retry/replay semantics.
- First-party connectors: Foodics-export compatibility, generic accounting CSV/QuickBooks export, kitchen-display passthrough mode (TalkTable takes orders, existing POS remains system of record — critical wedge for chains that won't rip out their POS).
- API keys per tenant with scopes, usage metering, developer docs portal.

**E5.4 — Enterprise identity & RBAC**
- SSO (OIDC first, SAML for chains), SCIM-lite user provisioning, custom roles with per-branch permission matrices, session policies (device limits for shared tablets).

**E5.5 — SOC 2 Type II preparation + compliance**
- Vendor selection (Drata/Vanta-class), control implementation (access reviews, change management evidence from CI, vendor management, incident response formalization), 3-month observation window started by M12 so Type II report lands ~M15; PCI scope kept SAQ-A (Stripe Elements only, no PAN touches our systems); PDPL/GDPR data-subject request tooling (export/delete customer).

### Team allocation (8 — hire FS engineer D + part-time compliance/ops)
| Person | Allocation |
|---|---|
| Tech lead | E5.1, E5.5 technical controls |
| FS A | E5.3 API + webhooks |
| FS B | E5.4 SSO/RBAC |
| FS C | E5.2 white-label |
| FS D (new) | E5.3 connectors, docs portal |
| AI engineer | AI cost optimization at scale, per-tenant persona tuning |
| Data engineer | Capacity/cost telemetry, enterprise reporting exports |
| Designer/FE | Theming system, status page, developer portal |

### Sprint breakdown (8 sprints, S17–S24)
- **S17–S18:** Theming tokens + custom domains; OpenAPI draft + webhook infrastructure; SSO OIDC; compliance vendor onboarded, gap assessment.
- **S19–S20:** API v1 GA (menus/orders read), white-label pilot with first chain; custom roles engine; access-review automation; 100× load test round 1.
- **S21–S22:** Webhooks GA + POS passthrough mode; SAML; Dammam region pilot tenant; status page + SLA instrumentation; DSR tooling.
- **S23–S24:** Connectors (Foodics export, accounting); SCIM-lite; chaos/DR drill at scale (doc 11 §5.3); SOC 2 observation window opens; enterprise pricing/contract templates with sales.

**Dependencies:** A signed chain (Firefly Burger multi-branch is the design partner — doc 13); legal for enterprise MSAs/DPAs; SOC 2 budget (~$30–50k vendor + audit).

**Risks:** Enterprise sales cycle outpacing engineering or vice versa (mitigate: design-partner-driven scoping, nothing built without a named customer); API versioning regret (mitigate: v1 conservative, additive-only changes, sunset policy published day one); compliance workload starving product (mitigate: dedicated part-time compliance owner, controls automated through CI evidence).

**Exit criteria:** One white-labeled chain live across ≥5 branches on enterprise SLA; ≥2 external integrations consuming the public API in production; SOC 2 Type I complete and Type II observation underway; 99.95% measured availability over the final quarter; platform unit costs within the cost-at-scale model (doc 15 §10) by ≤10%.

---

## Cross-phase summary

| Phase | Months | Headline | Team | Revenue posture |
|---|---|---|---|---|
| 1 | done | MVP live on Vercel | founders | pre-revenue |
| 2 | 1–2 | Voice + payments + Arabic | 5 | pilot (free allowance) |
| 3 | 3–5 | Multi-branch + CRM + billing engine | 6 | **first billed JOD** |
| 4 | 6–8 | AI BI + self-serve onboarding | 7 | scalable acquisition |
| 5 | 9–12 | Enterprise + white-label + API + SOC 2 | 8 | chain contracts |

Standing rules across all phases: 20% of every sprint reserved for bugs/tech-debt/support; no epic ships without its dashboard and alerts (doc 11); every irreversible decision gets an ADR (doc 15 §11); billing-touching code requires two reviewers.
