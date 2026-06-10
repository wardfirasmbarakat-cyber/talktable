# 14 — Investor Features & Narrative

**Firefly X TalkTable — Investor Memorandum Companion**

Audience: pre-seed/seed investors (MENA-focused funds, angels in F&B/SaaS). Live product: https://talktable-inky.vercel.app. Currency: 1 JOD = 1.41 USD (pegged).

---

## 1. Problem / Solution

**Problem.** Dine-in restaurants in Jordan and the wider MENA region run their floors on shouting, paper, and legacy POS terminals. The measurable pains:
- **Labor:** waiters spend 30–50% of their time taking orders and answering the same 30 questions ("is it spicy?", "is it halal-certified?", "what's in this sauce?") — in a market with chronic service-staff turnover.
- **Lost revenue:** slow order capture caps table turns at peak; no systematic upsell; diners who can't get attention order less and tip out.
- **Zero data:** an owner of a busy Amman restaurant typically cannot answer "what was my best-selling item last Friday?" without reading paper tickets. Existing POS systems record transactions, not behavior or intent.
- **Language:** the dining floor is bilingual (Arabic/English) and dialectal; imported software is English-first and tone-deaf.
- **Software pricing model mismatch:** POS/QR SaaS charges $50–300/month subscriptions regardless of usage — brutal for seasonal, thin-margin restaurants, so adoption stalls and churn is high.

**Solution.** TalkTable turns every table into an AI-staffed point of service: diners scan a QR, talk (text today, voice next) to an AI host that knows this restaurant's menu, ingredients, allergens, and house knowledge in Arabic and English, and orders flow in real time to kitchen, waiter, and manager dashboards — with feedback, inventory, analytics, and (next) CRM, forecasting, and automatic usage-based billing built in.

**The pricing weapon:** no subscription. **0.10 JOD per completed order.** Free QR installation and setup. The restaurant pays only when it sells. This collapses the adoption objection ("another monthly bill") to zero and aligns our revenue perfectly with customer success.

---

## 2. Market Size (TAM / SAM / SOM)

Reasoning is bottom-up from establishment counts × per-venue revenue capacity at our pricing; figures are planning estimates to be refreshed with each diligence cycle.

**Per-venue revenue capacity (the atom of the model):**
A table-service venue doing 100–1,000 orders/day at 0.10 JOD/order, with 40–70% digital adoption, yields **120–2,100 JOD/year/venue at conservative adoption** — we use a blended **~600 JOD (~$850)/year per active venue** for sizing (see §3 table).

| Layer | Definition | Count basis | Value |
|---|---|---|---|
| **TAM (MENA dine-in tech)** | All restaurants/cafés in MENA suitable for digital table ordering. Industry counts: Saudi ~45k licensed F&B service venues, UAE ~20k, Egypt ~40k+, Jordan ~3–4k, Lebanon/Iraq/Kuwait/Qatar/Bahrain/Oman/Morocco/Tunisia together ~80k+ → ~190k venues; assume 60% are dine-in-relevant ≈ 115k venues × $850 | **~$95–100M ARR** in order-fee revenue alone; including payments take-rate, CRM/BI premium modules and white-label (realistic blended $2–3k/venue at maturity, comparable to Foodics ARPU) → **TAM ≈ $250–350M** |
| **SAM (Jordan + GCC entry markets, 3-yr serviceable)** | Jordan (~3,500 dine-in venues) + Saudi/UAE fast-casual & casual-dine segments addressable without on-prem POS replacement (~25k venues) ≈ 28k venues | × blended $1,200 (order fees + payments margin) | **SAM ≈ $34M ARR** |
| **SOM (36 months)** | Jordan beachhead: 400 venues (≈11% of Jordan dine-in — achievable: Amman is geographically dense, ~60% of venues) + 200 GCC venues via chains/white-label | 600 venues × ~$1,400 blended (chains skew higher volume) | **SOM ≈ $0.8–1.0M ARR by month 36** |

**Why now:** (1) QR menu behavior was normalized post-2020 across MENA — the diner education cost is already paid; (2) LLMs crossed the threshold where a $0.02-per-order AI can genuinely converse in Jordanian Arabic about a specific menu — impossible at acceptable cost in 2022; (3) MENA restaurant-tech comparables (Foodics raised $170M Series C in 2022; Qlub, Grubtech funded) prove regional investor and acquirer appetite, while none of them is AI-conversation-first.

---

## 3. Business Model Deep-Dive: 0.10 JOD per Completed Order

**Mechanics:** every order reaching `COMPLETED` writes an immutable ledger entry; monthly auto-invoice via saved payment method; the owner watches the meter accrue live in the dashboard (radical transparency — see doc 12 E3.3). Free hardware-light install (QR pack + one tablet), no contract lock-in.

**Revenue per restaurant per month** (30 operating days, by digital adoption of dine-in orders):

| Orders/day (total) | 40% digital | 70% digital | 100% digital |
|---|---|---|---|
| 100 | 120 JOD ($169) | 210 JOD ($296) | 300 JOD ($423) |
| 250 | 300 JOD ($423) | 525 JOD ($740) | 750 JOD ($1,058) |
| 500 | 600 JOD ($846) | 1,050 JOD ($1,481) | 1,500 JOD ($2,115) |
| 1,000 | 1,200 JOD ($1,692) | 2,100 JOD ($2,961) | 3,000 JOD ($4,230) |

A single high-volume fast-casual branch at 70% adoption is worth **~$3.5–9k/year** — subscription-SaaS ARPU without subscription-SaaS sales friction. Gross margin per order ≈ 65–79% measured at pilot scale (doc 13 §5), trending ~75% at scale including voice.

**Why usage-based pricing is churn-resistant:**
1. **No cancellation trigger event.** Subscriptions die at renewal moments; usage fees have none. A slow month bills less — the product self-discounts exactly when the customer is most price-sensitive.
2. **Cost is invisible at the unit level.** 0.10 JOD on a 6 JOD ticket is ~1.7% of one order — versus 15–30% aggregator commissions restaurants already pay; we are an order of magnitude cheaper than the worst line on their P&L.
3. **Value and price are mechanically coupled.** Our invoice literally counts their sales. "TalkTable cost me 540 JOD" can only be said by an owner who processed 5,400 orders through it.
4. **Switching cost compounds.** The AI knowledge base, CRM history, and forecasting accuracy are trained on *their* data; a churned restaurant restarts from zero elsewhere (see §5 moats).
5. **Empirical pattern:** usage-priced infrastructure (Stripe, Twilio) exhibits net revenue retention >110% because growth of the customer is growth of the vendor; our NRR driver is digital-adoption % climbing within each venue plus branch expansion.

**Secondary revenue lines (roadmap):** payments margin on pay-at-table (Phase 2), premium AI BI module for chains, white-label/enterprise SLA fees, POS-integration API plans (Phases 4–5, docs 12/15). The 0.10 JOD fee is the wedge, not the ceiling.

---

## 4. Competitive Landscape

| | **TalkTable** | **Foodics** (KSA) | **iiko** (intl.) | **Sunmi/hardware QR menus** | **Generic QR ordering SaaS** (local agencies, MENU, etc.) |
|---|---|---|---|---|---|
| Core | AI conversation-first restaurant OS | Cloud POS + ecosystem | ERP-grade POS/back office | Hardware + static digital menu | QR menu → cart |
| AI ordering assistant | **Yes — bilingual, per-restaurant knowledge base** | No (analytics AI only) | No | No | No |
| Bilingual Arabic dialect UX | **Native, dialect-aware** | Arabic UI, no conversational AI | Weak Arabic | Static translations | Varies, usually shallow |
| Voice ordering | Phase 2 | No | No | No | No |
| Pricing | **0.10 JOD/order, no subscription** | ~$100–400+/mo/branch subscriptions | License + subscription | Hardware capex + fees | $30–150/mo |
| Hardware required | None (QR + any tablet) | Terminals | Terminals | Proprietary devices | None |
| Time to go live | < 1 day (60 min self-serve at Phase 4) | Days–weeks | Weeks | Days | Hours–days |
| Built-in CRM/loyalty + AI BI | Phase 3–4, AI-native | Yes (separate modules, extra cost) | Yes (complex) | No | No |
| POS replacement needed | **No — passthrough mode coexists** (Phase 5) | Yes (it *is* the POS) | Yes | No | No |
| Weakness vs us | — | Heavy, subscription friction, not diner-facing AI | Enterprise-complex, slow MENA fit | Dumb menus, no ops layer | Feature-thin, no moat, race to bottom |
| Our exposure | Brand/scale | Could acquire AI, owns POS install base | Limited MENA push | Commodity | Price noise at low end |

**Positioning sentence:** Foodics sells the restaurant a computer; TalkTable gives the restaurant an employee. We don't fight the POS — we own the conversation with the diner and the data it generates, then integrate downward into whatever POS exists (Phase 5 passthrough), which makes Foodics et al. potential partners/acquirers rather than blockers.

---

## 5. Moats

1. **Per-restaurant AI knowledge base.** Every restaurant accumulates a curated, conversation-tested corpus (menu semantics, house policies, the 30 real questions and their best answers, failure-mode labels from transcript review — doc 13 §4). This is painstaking to rebuild elsewhere and improves containment weekly. It is the SaaS-era "data entry lock-in" upgraded to "AI training lock-in".
2. **Bilingual + dialect voice.** Jordanian/Levantine-dialect conversational ordering, evaluated against a growing proprietary transcript test-set, is genuinely hard to replicate for Western competitors and not a priority for POS incumbents.
3. **Data network effects.** Cross-restaurant learning: intent taxonomies, menu-extraction accuracy, demand-forecast priors (Ramadan curves, weather elasticity, neighborhood effects) all improve with each venue and benefit every venue. Restaurant #100 onboards with better AI than restaurant #1 ever had.
4. **Pricing-model moat.** Incumbents structurally cannot match 0-subscription pricing without cannibalizing their subscription base; we have no legacy revenue to protect.
5. **Workflow embedding.** Kitchen, waiter, cashier, and manager run their shift inside TalkTable; billing is auto-collected. Operational gravity plus the billing ledger as the restaurant's de-facto sales record makes ripping us out a project, not a click.
6. **Compounding switching costs at the chain level (Phase 5):** white-label brand presence, POS/ERP integrations, SSO, and SLA contracts.

---

## 6. Traction Metrics Framework

What we report, every month, in this exact structure (investors should hold us to it):

**North star: completed (billable) orders per week, platform-wide.**

| Layer | Metrics |
|---|---|
| Acquisition | Venues live, pipeline (signed/installing), self-serve signups (Phase 4+), CAC per venue, install time |
| Activation | Days to first 100 orders, digital adoption % per venue (TalkTable orders ÷ dine-in orders) |
| Engagement/quality | AI containment rate (≥70% target), AI order share, kitchen accept time, waiter response p90, CSAT/NPS |
| Revenue | Billable orders, accrued JOD, blended take per venue, gross margin/order (AI+infra cost from usage ledger), NRR |
| Retention | Venue logo churn (target ~0 at this stage), order-volume retention per cohort |
| Moat | Knowledge-base size & containment trend per venue, transcript corpus size, forecast MAPE (Phase 4) |

Current status: Phase 1 product live (see docs/README.md), pilot with Firefly Burger Jordan per doc 13; pilot targets — ≥60 digital orders/day, ≥70% containment, NPS ≥ +40, paid conversion at week 8 — are the first traction proof points.

---

## 7. Five-Minute Investor Demo Script (live deployment)

*Setup: investor's own phone + one laptop. URL: https://talktable-inky.vercel.app. Demo accounts ready (manager/kitchen/waiter).*

1. **(0:00–0:30) Frame.** "Restaurant software in MENA charges subscriptions for dumb menus. We charge 10 piasters per order for an AI employee. Everything you'll see is live in production, and you'll be the diner."
2. **(0:30–2:00) Be the diner.** Investor scans a printed QR with their phone → lands on the table page instantly, no app, no login. Have them ask the AI, in Arabic if they wish: *"بدي شي حار بس بدون جبنة"* ("I want something spicy but without cheese") → AI recommends, handles a follow-up about allergens, builds the cart. Investor taps order. **Beat to land:** "No download. No menu hunting. It just talked to you — about *this* restaurant's food."
3. **(2:00–3:00) Be the kitchen.** Laptop on kitchen dashboard: their order is already on screen (realtime). Accept → prepare → ready; investor's phone updates live. Tap "call waiter" on the phone → waiter dashboard rings. **Beat:** "Front of house and back of house synchronized with zero hardware installed."
4. **(3:00–4:00) Be the owner.** Manager dashboard: analytics (top items, order volumes), the AI knowledge base ("this is the moat — every answer the AI just gave came from here, and it gets smarter weekly from real transcripts"), feedback view. Then the kicker: the billing meter mock/ledger — "that order you placed just accrued us 0.10 JOD. At one busy Firefly branch that's ~500 JOD/month, and the owner never sees a subscription bill."
5. **(4:00–5:00) The arc.** One slide: today (what they just touched) → Phase 2 voice + payments → Phase 3 multi-branch + auto-billing → Phase 4 AI that tells the owner what to buy and who to schedule → Phase 5 white-label chains across GCC. "We're raising to go from 1 restaurant to 60 in Jordan, then ride chains into Saudi."

Fallback discipline: if venue Wi-Fi is bad, demo runs on phone hotspot; if Anthropic hiccups, menu-tap ordering still completes the loop (graceful degradation is itself a talking point).

---

## 8. KPI Dashboard Definition (investor/board view)

Single page, auto-generated from the analytics store (doc 12 E4.4), refreshed daily:

- **Header tiles:** Billable orders (wk/mo, WoW%), Accrued revenue JOD, Live venues, Gross margin/order, Platform uptime.
- **Charts:** weekly billable orders (stacked by venue cohort), digital adoption % distribution across venues (box plot — the NRR engine), AI containment trend, AI cost per order vs 0.035 JOD guardrail, venue funnel (pipeline→installing→live→paid), cohort order-volume retention curves.
- **Tables:** top/bottom 5 venues by adoption (with action notes), incident log (P1/P2 with resolution time), cash position & runway (finance-fed).
- **Definitions appendix** pinned to the dashboard so numbers are never renegotiated: e.g., *billable order* = order reaching COMPLETED status, net of voids/test tables; *containment* = AI conversations not escalated to staff and not abandoned pre-resolution.

---

## 9. 18-Month Financial Model — Assumptions Table

| Assumption | Value | Basis |
|---|---|---|
| FX | 1 JOD = 1.41 USD | Peg |
| Take rate | 0.10 JOD/completed order | Pricing policy; held constant 18 mo |
| Venue ramp | M2: 1 (pilot) → M4: 10 → M9: 30 → M12: 60 → M18: 150 (incl. ~20 GCC via 2 chains) | doc 13 expansion gates + Phase 4 self-serve + Phase 5 chains |
| Orders/venue/day (billable) | starts 40, matures to 110 by month 6 of venue life | Pilot adoption curve assumption (40→70% digital of ~150–250 dine-in orders) |
| Venue logo churn | 1%/mo after month 3 of life | Usage pricing + moat thesis §3/§5; monitored |
| Gross margin/order | 70% blended (AI 0.02 JOD, infra+SMS 0.01 JOD at scale) | doc 13 §5 measurements + caching/model-routing levers |
| Payments attach (Phase 2+) | 30% of digital orders, net margin 0.4% of ticket (avg 6 JOD) → +0.0072 JOD/order blended | Conservative vs Qlub-style benchmarks |
| Team cost | 5 FTE → 8 FTE; blended fully-loaded $4.5k/mo (Jordan eng market) + 2 ops/sales by M12 ($2.5k) | doc 12 staffing plan |
| Infra + AI fixed floor | $1.5k/mo → $6k/mo by M18 | doc 15 cost-at-scale model |
| CAC per venue | 250 JOD (sales day + QR/tablet kit + waiver cost) falling to 120 JOD with self-serve | Pilot playbook ≤1 install day |
| Other opex (legal, SOC 2, tools, office) | $3k/mo avg, SOC 2 lump $40k in M10–12 | doc 12 Phase 5 |
| **Output — M12** | ~60 venues × ~95 orders/day avg × 0.10 JOD ≈ **17.1k JOD/mo (~$24k MRR-equiv.)**, ~$290k run-rate | |
| **Output — M18** | ~150 venues × ~105 orders/day ≈ **47k JOD/mo (~$66k MRR-equiv.)**, ~$800k run-rate + payments line | Approaches SOM trajectory §2 |
| Implied 18-mo burn | ~$1.1–1.3M total opex vs ~$300k cumulative revenue → net burn ≈ $0.9–1.0M | Sets the seed ask |

Sensitivities reported with the model: ±20% on orders/venue/day moves M18 run-rate $640k–$960k; containment <60% raises support cost/CAC; AI cost breach of guardrail compresses margin to ~55% (mitigations in doc 13 §5).

---

## 10. Fundraising Milestones

**Pre-seed — now: $350–500k (SAFE).**
- Use: 5-person team for 9 months, pilot → 30 venues, Phases 2–3 shipped (voice, payments, multi-branch, billing engine live and collecting).
- Milestones unlocked for seed: 30 paying venues, ≥250k cumulative billable orders, NRR >100% on first cohorts, containment ≥70%, first multi-branch group live, measured CAC ≤250 JOD with ≤1-day installs.

**Seed — month 9–12: $2–3M.**
- Trigger metrics (any investor can verify from the §8 dashboard): ~$20k+ MRR-equivalent growing >15% MoM, logo churn ≤1%/mo, gross margin ≥65%, one signed chain/white-label LOI for GCC.
- Use: GCC entry (Saudi entity + 2 chain deployments), team to 12–14, Phase 4–5 completion (AI BI, self-serve, white-label, API, SOC 2 Type II), sales motion (2 AEs Amman/Riyadh).
- Sets up Series A at ~$2.5–4M ARR run-rate with the Foodics-adjacent strategic landscape as both benchmark and exit optionality.

**Capital efficiency note:** Jordan engineering costs (~1/3 of US) mean this plan reaches ~$800k run-rate on ~$1M net burn — a revenue-per-dollar-burned profile that itself is part of the pitch.
