# Firefly X TalkTable — Specification Library

The complete production specification set for **Firefly X TalkTable**, the AI-powered restaurant operating platform. Business model: no subscriptions — restaurants pay **0.10 JOD per completed order**, with free QR installation/setup and automatic billing.

## Document Index

| # | Document | One-line description |
|---|---|---|
| 01 | `01-product-vision.md` | Product vision, positioning, and the "AI employee at every table" thesis |
| 02 | `02-personas-journeys.md` | Personas (diner, waiter, kitchen, cashier, manager, owner, platform ops) and end-to-end journeys |
| 03 | `03-functional-spec.md` | Full functional specification of every surface and feature |
| 04 | `04-data-model.md` | Data model: entities, relationships, and the multi-tenant org/branch hierarchy |
| 05 | `05-api-spec.md` | Internal and public API specification (routes, contracts, auth) |
| 06 | `06-ai-architecture.md` | AI architecture: grounding, knowledge base, prompt assembly, voice pipeline, evals |
| 07 | `07-security-auth.md` | Security model: authentication, RBAC, table tokens, tenant isolation, audit |
| 08 | `08-realtime-architecture.md` | Realtime architecture: Socket.io today → Firestore listeners target |
| 09 | `09-billing-payments.md` | Billing engine (0.10 JOD/order ledger, invoicing, dunning) and diner payments |
| 10 | `10-design-system.md` | Design system, bilingual/RTL standards, theming foundations |
| 11 | [`11-deployment-architecture.md`](./11-deployment-architecture.md) | Environments, hosting topology + MENA region strategy, CI/CD with rollout/rollback, monitoring, backup/DR, performance budgets |
| 12 | [`12-development-roadmap.md`](./12-development-roadmap.md) | 12-month engineering roadmap, Phases 1–5 with sprint-level epics, team allocation, risks, and exit criteria |
| 13 | [`13-mvp-roadmap.md`](./13-mvp-roadmap.md) | Go-to-market MVP plan: Firefly Burger pilot readiness, 4-week launch sprint, success metrics, 0.10 JOD unit economics, expansion to restaurants 2–10 |
| 14 | [`14-investor-features.md`](./14-investor-features.md) | Investor narrative: market sizing, business-model deep-dive, competition, moats, demo script, KPI dashboard, financial model, fundraising milestones |
| 15 | [`15-enterprise-architecture.md`](./15-enterprise-architecture.md) | Enterprise architecture: multi-region, tenant isolation, SLAs, white-label, POS/ERP API, SSO/RBAC, compliance, capacity/cost math, and the 8 core ADRs |

## Current Status

**Phase 1 is live:** https://talktable-inky.vercel.app

The deployed MVP (this repository) runs Next.js 15 + Prisma/PostgreSQL (Neon) + Socket.io + JWT auth + Anthropic-powered AI chat, and includes:

- **Diner experience** at `/r/[slug]/[tableToken]` — QR table ordering with a bilingual AI assistant grounded in the restaurant's menu and knowledge base, cart/order placement, live order status, call-waiter, and feedback.
- **Staff dashboards** — kitchen (live order pipeline), waiter (call queue + delivery), manager (menu, inventory, knowledge base, feedback, analytics, tables/QR), and admin (users, settings, audit log).
- **Demo accounts** are seeded for each role (manager / kitchen / waiter / admin) along with a complete demo restaurant — run `npm run db:seed` locally or use the seeded credentials on the live deployment to explore every surface.

**Next up:** the Firefly Burger Jordan pilot (doc 13) on the existing codebase, in parallel with Phase 2 (voice AI, payments, PWA, full Arabic RTL — doc 12).
