# 13 — MVP Go-To-Market Roadmap

**Firefly X TalkTable — Pilot Launch Plan: Firefly Burger Jordan**

Document owner: CEO/CTO jointly · Scope: the next 4 weeks + expansion to restaurants 2–10 · Principle: **ship the pilot on the EXISTING codebase** (Next.js + Prisma + Neon + Socket.io on Vercel, live at https://talktable-inky.vercel.app). The Firebase migration (doc 12, Phase 3) does not block revenue learning.

---

## 1. Definition of "Pilot-Ready"

Pilot-ready means a real dinner service at Firefly Burger runs end-to-end on TalkTable with no founder standing next to the kitchen screen. Concretely, every item below is true:

**Diner experience**
- [ ] Every table has a printed, laminated QR (table-token URLs from `/api/tables`) tested from iOS Safari + Android Chrome on Zain/Orange/Umniah mobile data, not just Wi-Fi.
- [ ] Full Firefly Burger menu loaded: items, prices, photos, Arabic + English names/descriptions, allergens, modifiers expressed via item options or AI clarification.
- [ ] AI assistant answers the top-30 real questions (built from staff interviews: "Is it spicy?", "What's in the special sauce?", "Do you have halal certification?", "Can I get it without pickles?") correctly in both languages — verified by a written test script run before launch.
- [ ] AI gracefully degrades: if Anthropic errors or the diner ignores chat, classic menu-tap ordering works 100% standalone.
- [ ] Call-waiter works and a human shows up (process, not just software: waiter dashboard device is mounted, charged, audible).
- [ ] Feedback prompt appears post-order.

**Staff experience**
- [ ] Kitchen tablet (provided by us, ~120 JOD Android tablet) mounted, locked to kitchen dashboard, new-order sound on, survives a 6-hour shift without dying or logging out (JWT session lifetime adjusted).
- [ ] Waiter phone(s) logged into waiter dashboard; order-ready and call notifications tested at real noise levels.
- [ ] Manager has done menu edit, 86-an-item (out of stock), and end-of-day analytics review unassisted.
- [ ] 45-minute staff training delivered (Arabic), plus a one-page laminated cheat-sheet per role.

**Operational readiness**
- [ ] Sentry + uptime monitor + synthetic order check live (doc 11 §4 minimum set); founder phone alerts during service hours.
- [ ] Daily automated Neon backup verified restorable once.
- [ ] Rate limiting on `/api/ai/chat` (per table token) to cap abuse cost.
- [ ] Incident playbook: "AI down → menu-only mode", "internet down → paper fallback announced to staff", "wrong order → manager comp flow", each with a named owner.
- [ ] Data: order events and AI token usage logged per order (this is the unit-economics instrumentation — §5 depends on it).
- [ ] Agreement signed: pilot terms = 0.10 JOD/order **tracked and invoiced but waived for the first 30 days** (so pricing is experienced, not just promised), we provide tablet + QR install free, either side can exit with 7 days notice, restaurant grants feedback access.

Explicitly **not** required for pilot: online card payments (cash/existing card machine at counter as today), voice ordering, loyalty, multi-branch, PWA install for diners. These are Phase 2 (doc 12) and the pilot informs their priority.

---

## 2. Four-Week Sprint Plan to Pilot Launch

### Week 1 — Harden what exists
- **Mon–Tue:** Bug-bash the live deployment on real phones over mobile data; fix the top breakages (focus: Socket.io fallback behavior on Vercel — verify polling fallback for order updates is reliable; if not, add a 5-second SWR poll on kitchen/waiter dashboards as belt-and-braces. This is a known Phase-1 limitation and must not be hand-waved).
- **Wed:** Session-lifetime + device-lock work for kitchen tablet; new-order audio alert; rate limiting on AI route.
- **Thu:** Sentry, uptime check, synthetic order script (places + cancels a test order against a hidden test table every 10 min during 11:00–23:00 Amman).
- **Fri:** AI usage logging per request (tokens in/out, model, latency, orderId/tableId correlation) — lands the instrumentation for §5.

### Week 2 — Firefly Burger content + Arabic
- **Mon–Tue:** On-site menu workshop: photograph dishes, load full menu with Arabic/English content via manager dashboard; encode allergens/ingredients.
- **Wed:** Knowledge-base interview with owner + head waiter → 40–60 `KnowledgeItem` entries (hours, halal, kids, parking, promotions, sauce ingredients, spice scale). Write the 30-question AI test script.
- **Thu:** Arabic UX pass on the diner surface only (the revenue-critical screen): RTL bugs, font, currency display "د.أ / JOD".
- **Fri:** AI test script run #1; tune knowledge entries and system prompt until ≥28/30 pass in both languages.

### Week 3 — Dress rehearsal
- **Mon:** Print + laminate QR codes; mount kitchen tablet; physical walkthrough of every table.
- **Tue:** Staff training session #1 (kitchen + waiters, Arabic) with simulated orders from founders' phones at 10 tables simultaneously.
- **Wed:** **Friends-and-family service:** 15–20 invited guests order real food through the system during a controlled evening. Founders observe, log every friction point.
- **Thu:** Fix list from rehearsal (expect: notification audibility, item naming confusion, AI answer gaps, table-token mixups).
- **Fri:** AI test script run #2; incident playbook tabletop exercise with the manager; go/no-go review against §1 checklist.

### Week 4 — Live pilot
- **Mon:** Soft launch — QR active on 30% of tables, staff offers it as an option. Founder on site all service.
- **Tue–Wed:** Expand to all tables if Mon was clean; founder on site evenings only.
- **Thu:** First weekly review with owner: orders/day, AI transcript review (sample 30 conversations), staff feedback session.
- **Fri:** Remote-only operation day — the true test of §1's "no founder next to the kitchen screen". Week-4 metrics snapshot becomes the baseline for §3.

Engineering capacity note: this consumes roughly 60% of the team for 4 weeks; the remaining 40% starts Phase 2 spikes (doc 12, S1) in parallel so GTM doesn't stall product.

---

## 3. Pilot Success Metrics (measured weeks 5–8, vs. week-4 baseline)

| Metric | Definition | Target | Kill/iterate threshold |
|---|---|---|---|
| **Digital orders/day** | Orders placed through TalkTable per operating day | ≥ 60/day by week 8 (Firefly Burger does ~150–250 orders/day across dine-in; target ≥40% of dine-in volume) | < 20/day after week 6 → adoption problem, investigate placement/staff buy-in before code |
| **Order adoption rate** | TalkTable orders ÷ total dine-in orders | ≥ 40% | < 15% |
| **AI containment rate** | Conversations resolved (order placed or question answered) without waiter escalation or abandonment | ≥ 70% | < 50% → knowledge base or UX failure |
| **AI order share** | Orders where the AI chat materially participated (vs pure menu taps) | ≥ 25% (learning metric, no kill threshold) | — |
| **Waiter response time** | Call-waiter request → marked resolved | median ≤ 3 min, p90 ≤ 6 min | p90 > 10 min → process problem |
| **Kitchen accept time** | Order placed → kitchen accepted | median ≤ 90 s | > 5 min → screen attention problem |
| **Order error rate** | Orders remade/comped due to system-attributed mistakes | ≤ 1% | > 3% |
| **Diner NPS / CSAT** | In-app feedback (1–5 stars + NPS question on a sample) | CSAT ≥ 4.3, NPS ≥ +40 | NPS < 0 |
| **Staff satisfaction** | Weekly 3-question pulse (1–5) | ≥ 4.0 by week 8 | < 3.0 → the product fights the floor |
| **System availability** | Uptime during service hours (11:00–24:00) | ≥ 99.5% | any full-service outage triggers postmortem |
| **Owner verdict** | "Would you pay 0.10 JOD/order when the waiver ends?" asked at week 4 and week 8 | unambiguous yes at week 8 + signed conversion | hesitation → pricing/value interview |

---

## 4. Feedback Loop

1. **Daily (weeks 4–6):** automated end-of-day digest to founders — orders, containment, escalations, errors, worst AI conversation of the day (lowest-confidence/abandoned). 15-minute founder triage; anything diner-visible fixed within 24 h.
2. **Weekly:** 30-minute on-site review with owner + head waiter using a fixed agenda (metrics vs targets, top-3 frictions, one experiment for next week). Minutes logged in the repo (`docs/pilot/weekly/`).
3. **AI transcript review:** sample 30 conversations/week, label failure modes (knowledge gap / language / UX / hallucination), feed into knowledge base edits and the prompt-eval set — this corpus becomes the moat asset described in doc 14 §6.
4. **Diner intercepts:** 10 table-side micro-interviews/week (2 questions: "what was confusing?", "would you use this again?").
5. **Change discipline:** pilot restaurant gets release notes in Arabic via WhatsApp before any UX change; no changes deployed Friday–Saturday (peak).

---

## 5. Pricing Validation: Unit Economics of 0.10 JOD/Order

0.10 JOD ≈ **$0.141** (peg: 1 JOD = 1.41 USD). All costs below are per **completed order** and must be measured, not assumed — the Week-1 instrumentation exists exactly for this. Planning figures:

### Cost per order (current stack, pilot scale)

| Cost line | Basis | Per order |
|---|---|---|
| AI chat (Anthropic) | ~3 AI exchanges/order; system prompt + menu/knowledge grounding ≈ 3–5k input tokens, ~300 output tokens per exchange, on a Sonnet-class model; with prompt caching of the static menu/knowledge block (≥70% of input tokens cached at ~10% price) | $0.015–0.030 |
| Infra (Vercel + Neon) | Pro plans ≈ $45/mo at pilot scale ÷ ~2,000 orders/mo | $0.020 → falls < $0.005 at 10 restaurants (fixed-cost amortization) |
| Monitoring/misc SaaS | Sentry/uptime ≈ $30/mo ÷ 2,000 | $0.015 → similarly amortizing |
| SMS/receipts (when added) | optional | ~$0.005 |
| **Total marginal cost** | pilot / at 10 restaurants | **≈ $0.05 / ≈ $0.03** |

### Margin

| Scale | Revenue/order | Cost/order | Gross margin |
|---|---|---|---|
| Pilot (1 restaurant) | $0.141 | ~$0.050 | ~65% |
| 10 restaurants | $0.141 | ~$0.030 | ~79% |
| 100+ restaurants (Phase 4 targets, incl. voice) | $0.141 | ~$0.035 (voice STT adds cost; caching + cheaper-model routing for simple intents subtracts) | ~75% |

**Validation protocol during pilot:**
- Measure actual AI cost/order weekly from the usage ledger. **Guardrail: AI cost must stay < 0.035 JOD/order ($0.05).** If exceeded: enable prompt caching (first lever), route FAQ-style turns to a Haiku-class model, trim grounding context to retrieved-relevant knowledge items only.
- Validate willingness-to-pay three ways: (a) the waived-but-visible invoice — owner sees "you would have owed 41.700 JOD this month" against, e.g., one waiter-hour/day saved (~150 JOD/mo) and upsell lift; (b) week-8 conversion signature; (c) price-sensitivity interviews with 5 prospect restaurants ("at what per-order price does this become a no?" — testing 0.05/0.10/0.15/0.20).
- Sanity anchor for the owner: 0.10 JOD on an average ~5–7 JOD Firefly order ticket = **1.4–2% of one order's value, ~0.5–0.7% of revenue if half of orders are digital** — versus 15–30% aggregator commissions they already tolerate for delivery.

---

## 6. Expansion Criteria: Restaurants 2–10

**Gate to start expansion (all required):**
1. Firefly Burger converts to paid (signed) and metrics §3 hit green for 2 consecutive weeks.
2. Onboarding playbook documented such that a non-founder can install a restaurant in ≤ 1 on-site day (menu load, QR print, tablet, training) — measured on restaurant #2.
3. Measured AI cost/order under guardrail; margin ≥ 60%.
4. Support load ≤ 2 founder-hours/week for the pilot.

**Selection strategy for #2–10 (Amman first):**
- 2–3 more **fast-casual** (Firefly look-alikes — proves repeatability of the playbook),
- 2–3 **casual dine-in with table service** (higher ticket, tests waiter workflows harder),
- 1–2 **cafés/shisha** (long table occupancy → high AI interaction, reorder-heavy: tests per-order pricing in a many-small-orders regime),
- 1 **multi-branch group** as Phase-3 design partner (ideally Firefly Burger's other branches — warm path to the doc 12 E3.1 epic and the doc 14 chain narrative),
- Deliberately exclude (for now): fine dining (low order count, high-touch service), delivery-only kitchens (no tables).

**Per-cohort terms:** restaurants 2–5 get 30-day waiver; 6–10 get 14 days; nobody is ever "free forever" — the invoice meter is always visible from day one.

**Targets at restaurant 10 (≈ end of Month 4, aligning with doc 12 Phase 3):**
- ≥ 12,000 billable orders/month platform-wide → ≥ 1,200 JOD MRR-equivalent (~$1,700),
- ≥ 70% average containment, churn 0 of 10, onboarding ≤ 1 day each,
- Dataset: ≥ 50k AI conversation turns labeled by outcome — the training/eval asset for Phase 4 BI and the doc 14 moat story.

**Stop-expansion triggers:** any restaurant churning for product reasons; support hours scaling linearly with restaurants; availability < 99.5% in any two weeks. Expansion pauses, root cause fixed, then resumes — ten healthy references beat thirty noisy logos.
