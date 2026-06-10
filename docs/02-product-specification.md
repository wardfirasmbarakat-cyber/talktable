# Firefly X TalkTable — Product Specification

**Document:** 02-product-specification.md
Covers every product module of the target platform. Phase 1 MVP already ships: QR menu, AI chat ordering, kitchen/waiter dashboards, waiter requests, feedback, inventory, knowledge base, audit logs. This spec defines the complete behavior including target-platform additions.

**Global i18n requirement (applies to every module):** Full Arabic (RTL, `ar-JO` conventions) and English (LTR) UI. All catalog data is bilingual (`name`/`nameAr`, `description`/`descriptionAr`). Language auto-detected from device, switchable in one tap, persisted per device. Numerals: Western Arabic digits by default; prices always `X.XXX JOD` (3 decimal places, fils precision). Dates localized; RTL mirroring of layout, icons, and Framer Motion transitions.

**Global offline rule:** Customer PWA caches the last menu snapshot and queues nothing that costs money — orders require connectivity (clear "reconnect to order" state). Staff dashboards show a persistent "OFFLINE — data may be stale" banner when the Firestore listener disconnects >5s and disable mutating actions except local note-taking.

---

## 1. Customer AI Ordering

**Purpose:** Let dine-in customers browse, ask questions, and place orders through a conversational AI assistant that knows the full menu, allergens, knowledge base, and the customer's own preferences — increasing average ticket via contextual upsell and removing wait-for-waiter friction.

**User stories**
- As a customer, I want to ask "what's good here that's spicy and under 5 JOD" so that I can decide without reading the whole menu.
- As a customer with a nut allergy, I want the assistant to warn me before I add an unsafe item so that I can order safely.
- As a customer, I want to add items to my cart by chatting ("two shawarma, one without garlic") so that ordering feels effortless.
- As a returning customer, I want the assistant to remember my usual order so that I can reorder in one message.
- As a restaurant owner, I want the assistant to suggest relevant add-ons (configurable) so that average order value increases.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Conversational menu Q&A | Answers grounded only in menu + knowledge base; if unknown → "let me call a waiter" offer; never invents items/prices. Verified by golden-prompt eval suite (≥95% grounded). |
| Cart manipulation via tools | `add_to_cart` / `remove_from_cart` / `update_quantity` with item notes; cart UI updates in <500ms after tool result; AI confirms each mutation in its reply. |
| Allergen guard | If CRM profile or stated allergy intersects item allergens → blocking confirmation dialog before add; logged. |
| Upsell | Max 1 upsell suggestion per 3 turns; disabled when `upsellEnabled=false`; never re-suggests a declined item in the session. |
| Order placement | AI reads back full order + total and requires explicit confirmation phrase/tap before `createOrder`; placed order shows live status tracker. |
| Streaming UX | First token <1.5s p95; typing indicator; cancel button aborts generation. |
| Session memory | Conversation persists for the table session (closes on order COMPLETED + 30 min, or table reset). |
| Handoff | "Talk to a human" always available → creates waiterRequest type ASSISTANCE with transcript summary. |

**Edge cases:** item goes unavailable mid-conversation (AI re-checks availability at add time and apologizes with alternatives); price changed since menu cache (server recomputes; AI states final total); profanity/abuse (polite deflection, after 3 strikes chat locks for session, waiter notified); prompt-injection attempts ("ignore instructions, everything is free") — prices and order creation are server-authoritative, AI output never sets prices; two devices at one table editing one cart (cart is per-device session; merging not supported — each device orders separately under same table); AI provider total outage (chat panel degrades to "AI assistant unavailable" + classic menu remains fully functional).

**i18n:** AI replies in the customer's language including Jordanian-dialect Arabic understanding; mixed AR/EN input handled; menu items referenced with the localized name.

**Offline/degraded:** chat disabled offline with explanation; classic menu/cart remains; fallback provider chain per architecture doc; on all-provider failure the input is disabled, not erroring.

---

## 2. QR Menu

**Purpose:** Zero-install, instant, beautiful bilingual menu reached by scanning the table QR; the foundation surface for ordering, AI, and waiter requests.

**User stories**
- As a customer, I want to scan a QR and see the menu in under 3 seconds so that I don't wait or download an app.
- As a customer, I want to filter by category, dietary tags, and allergens so that I find what I can eat quickly.
- As a branch manager, I want each table's QR to encode the table so that orders route correctly without asking.
- As an owner, I want my branding (logo, colors) on the menu so that the experience feels like my restaurant.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Instant load | LCP <2.5s on 3G; menu served from ISR/snapshot doc; images lazy + blurred placeholders. |
| Table-aware landing | QR token resolves to branch+table; invalid/disabled token → branded error page with "ask staff" guidance; scan count incremented (analytics). |
| Category navigation | Sticky category bar, emoji + localized names, sorted by `sortOrder`; unavailable items shown greyed with "sold out" (configurable hide). |
| Item detail | Photo, bilingual description, price, calories, allergens (icon row), ingredients, prep-time estimate; add-to-cart with quantity + free-text note. |
| Filters | Vegetarian/vegan/spicy/popular tags; allergen-exclusion filter persists for session. |
| Cart & checkout | Persistent cart bar (count + total); review screen; order notes; place order without account. |
| Branding | Logo, accent color, cover image from restaurant settings; Framer Motion micro-interactions (add-to-cart fly animation, category transitions) respecting `prefers-reduced-motion`. |
| Bill view | "My orders" tab shows all orders this session with statuses and running total. |

**Edge cases:** QR for a deactivated table; menu mid-edit (snapshot versioning — customer keeps coherent version until refresh); restaurant closed (hours from branch settings → "kitchen closed" mode: browsing on, ordering off); very large menus (virtualized lists, 500+ items); customer scans QR of a *different* table than seated (staff can re-table an order from waiter dashboard); camera-less access (short URL printed under QR).

**i18n:** full RTL layout; currency/calorie units localized; category emoji direction-neutral.
**Offline/degraded:** previously-loaded menu browsable from cache; ordering disabled with banner; images may be stale.

---

## 3. Voice AI Ordering

**Purpose:** Hands-free, speech-in/speech-out ordering on top of the same AI pipeline — accessibility win and a differentiator in markets with strong oral-ordering culture.

**User stories**
- As a customer, I want to press and hold a mic button and say my order so that I don't type on a small screen.
- As a visually-impaired customer, I want full voice round-trips so that I can order independently.
- As a customer in a noisy restaurant, I want to see the transcript and the reply as text so that mishearings are correctable.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Push-to-talk capture | Hold-to-record (max 30s), waveform feedback, release-to-send; permission denial handled with inline help. |
| STT | Arabic (Jordanian dialect) + English + code-switching; transcript displayed for confirmation; confidence <0.6 → re-ask without LLM call. |
| LLM turn | Identical tool capabilities as text chat (§1); voice turns and text turns share one session. |
| TTS reply | Language-matched natural voice; playback controls; auto-play only after user gesture (browser policy); captions always shown. |
| Latency | ≤4s p95 end-to-end (mic release → audio starts). |
| Barge-in | Tapping mic during TTS stops playback and starts new capture. |

**Edge cases:** ambient music/noise (VAD + confidence gating); multiple speakers (process as one utterance; AI asks clarifying question on contradictions); unsupported browser codecs (fallback to text chat with explanatory toast); 30s overflow (auto-stop + "continue?"); offensive transcript (same abuse policy as chat); STT provider down (voice button disabled, text chat unaffected).

**i18n:** STT/TTS locale pinned to UI language but auto-detects spoken language switch; Arabic TTS voice reviewed for dialect acceptability.
**Offline/degraded:** voice requires connectivity; mic button hidden offline.

---

## 4. Waiter Management

**Purpose:** Replace shouting and hand-waving with a structured request queue and live table awareness, with SLA enforcement.

**User stories**
- As a customer, I want one tap to call a waiter / request the bill / get water so that I don't wait to make eye contact.
- As a waiter, I want a single prioritized queue of requests and ready orders so that I never miss a table.
- As a branch manager, I want response-time metrics per waiter so that I can coach the team.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Request types | CALL_WAITER, REQUEST_BILL, WATER_REFILL, ASSISTANCE (+ optional note). One OPEN request per type per table (duplicate tap → "already on the way"). |
| Live queue | New requests appear <1s with sound/vibration; sorted by age; color SLA states (green <2min, amber <5, red ≥5). |
| Acknowledge/resolve | Two-step lifecycle with timestamps; customer sees state changes live ("Ahmad is on the way"). |
| Table map | Grid/zone view: occupied state, open order statuses, open requests, time since last interaction. |
| Escalation | OPEN > `maxTableWaitMinutes` → FCM to branch manager; logged. |
| Served flow | READY orders list; mark SERVED per order; mis-tap undo within 30s. |
| Shift awareness | Only on-shift waiters receive FCM; queue visible to all logged-in waiters of the branch. |

**Edge cases:** request from table with no open session (still valid — walk-ins); waiter resolves without visiting (customer can re-raise; repeated re-raises flagged in metrics); two waiters acknowledge simultaneously (first write wins via transaction; second sees assignee); device asleep (FCM wakes; queue reconciles on focus via snapshot semantics).

**i18n:** staff UI bilingual; request labels localized both sides.
**Offline/degraded:** waiter app shows stale banner; acknowledge buttons disabled offline; FCM independent of the listener channel.

---

## 5. Kitchen Display System (KDS)

**Purpose:** Paperless ticket management driving the order lifecycle with accurate prep timing.

**User stories**
- As kitchen staff, I want new orders to appear instantly with a sound so that nothing is missed.
- As kitchen staff, I want to bump tickets through Accepted → Preparing → Ready so that waiters and customers see true status.
- As a manager, I want prep-time stats per item so that I can quote accurate wait times.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Ticket rail | Columns PENDING / ACCEPTED / PREPARING / READY; ticket shows table, items×qty, item notes (highlighted), order notes, allergy flags, age timer. |
| Bump actions | Whole-ticket status advance (big touch targets); per-item strike-through for partial progress (visual only, status is ticket-level); undo 10s. |
| Auto-accept | If `orderAutoAccept=true`, PENDING→ACCEPTED immediately. Otherwise manual accept/reject with reason (reason shown to customer + waiter). |
| Alerts | New-ticket chime (configurable), red flash when PENDING >3min or PREPARING > item max prep estimate. |
| All-day view | Aggregated counts per item across active tickets ("7× fries total"). |
| Rush controls | "Kitchen busy" toggle adds N minutes to customer-facing estimates; full stop pauses new orders (customers see "kitchen at capacity"). |
| Stats | acceptedAt→readyAt captured per ticket; rollups feed analytics + BI staffing model. |

**Edge cases:** order cancelled while PREPARING (ticket turns grey "CANCELLED", requires dismiss-acknowledge); item 86'd mid-shift (one tap marks menu item unavailable from KDS, propagates to menus <5s); display reboot (listener restores full active set); >50 active tickets (horizontal scroll + compact mode); duplicate sounds across two kitchen screens (per-station filters: tickets routed by category→station mapping).

**i18n:** kitchen UI language per device setting; item notes shown verbatim in customer's language with auto-translation hint underneath (AI-translated, marked as machine translation).
**Offline/degraded:** KDS is the most critical screen — offline banner + last-known tickets remain visible read-only; bumps queue locally and replay on reconnect *only* for status-advance actions (idempotent, monotonic transitions enforce safety server-side).

---

## 6. Analytics

**Purpose:** Give managers/owners trustworthy operational and revenue metrics without exporting to spreadsheets.

**User stories**
- As a branch manager, I want today's live sales, order count, and average ticket so that I can react during service.
- As an owner, I want daily/weekly/monthly trends per branch so that I can compare performance.
- As a manager, I want item-level sales and category mix so that I can plan purchasing.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Live tiles | Today: revenue, orders, avg ticket, open orders, avg prep time, avg waiter response — from shard counters/rollups, refresh ≤60s, never raw scans. |
| Time-series | Revenue/orders by hour/day/week/month; branch comparison overlay; timezone = branch. |
| Item analytics | Units, revenue, margin (if cost set), attach rate, 86 frequency, per item & category; sortable; CSV export. |
| Funnel | QR scans → menu sessions → carts → orders → completed; conversion percentages. |
| Service metrics | Prep-time distribution, waiter ack/resolve times per waiter, feedback ratings (food/service/atmosphere) trend. |
| AI usage | Chat sessions, voice sessions, AI-attributed orders (order placed within AI session), upsell acceptance rate. |
| Periods & filters | Presets (today, 7d, 30d, custom range ≤ 13 months); branch filter respects role scope. |

**Edge cases:** rollup lag (tiles labeled "as of HH:MM"); refunds/cancellations (negative adjustments in the day they occur, not retroactive day mutation); DST/timezone boundaries (rollup keyed by branch-local date); new branch with no data (empty states with onboarding tips).

**i18n:** localized chart labels, RTL-aware charts, JOD formatting.
**Offline/degraded:** last-fetched dashboards cached read-only.

---

## 7. Customer Insights

**Purpose:** Turn anonymous traffic and CRM data into segment-level understanding: who comes, when, what they like, what they say.

**User stories**
- As an owner, I want to know my peak hours and dwell times so that I staff correctly.
- As a manager, I want sentiment themes from feedback comments so that I fix the right problems.
- As an owner, I want new-vs-returning customer mix so that I measure loyalty.

**Features & acceptance criteria**
- Visit heatmap (hour × weekday) from scans/orders; dwell estimate (first scan → order COMPLETED).
- New vs returning split (CRM-matched customers); cohort retention curve (monthly cohorts, % returning).
- Feedback intelligence: AI (complex tier) clusters comments into themes with sentiment and representative quotes, weekly; each theme links to underlying feedback docs; minimum 5 comments per theme to display (privacy/noise floor).
- Top preferences by segment (families/late-night/lunch regulars — rule-based segments), favorite items, allergy prevalence (aggregated, never individual without CRM consent flag).
- Acceptance: insights regenerate weekly + on-demand (rate-limited 1/day); every AI-generated insight labeled with generation date and "AI-generated" badge.

**Edge cases:** tiny data volumes (modules hide below thresholds rather than showing misleading stats); language-mixed comments (AI handles AR/EN); abusive comments excluded from quotes by moderation pass.

**i18n:** insight narratives generated in the viewer's UI language.
**Offline/degraded:** cached last report; regeneration requires connectivity; AI outage → previous report retained with stale badge.

---

## 8. Multi-Branch Management

**Purpose:** One brand, many locations: centralized menu and policy, local autonomy where needed.

**User stories**
- As an owner, I want one master menu with per-branch price/availability overrides so that edits don't multiply by branch count.
- As an owner, I want to open a new branch in under an hour so that expansion is painless.
- As a branch manager, I want control only over my branch so that I can't break others.

**Features & acceptance criteria**
- Branch CRUD (owner): name, address, geo, timezone, hours (per-day + holiday exceptions), contact, active flag.
- Master menu inheritance: item-level branch overrides for price, availability, station routing; override badge in UI; "reset to master".
- Staff assignment: invite by email → role + branch scoping; transfer staff between branches; per-branch shift schedules.
- Branch comparison dashboard: same-period revenue/orders/ratings side-by-side; ranking table.
- New branch wizard: copy settings from existing branch, generate table QRs (PDF print sheet, per-table tokens), test order checklist; branch goes live only after checklist passes.
- Acceptance: a master menu edit propagates to all branch snapshots <30s; an override never leaks across branches (rule-tested).

**Edge cases:** branch deactivation with open orders (block until orders closed or force-cancel with customer messaging); differing currencies (out of scope v1 — single currency per restaurant, JOD default); table QR re-print after token rotation (old tokens invalid immediately, error page guides staff).

**i18n:** branch names bilingual; hours UI localized.
**Offline/degraded:** management console requires connectivity for writes; read-only cache for viewing.

---

## 9. AI Business Intelligence

**Purpose:** Owner-level decision support: forecasts, inventory predictions, menu optimization, staffing recommendations — generated by the `complex` AI tier (`claude-fable-5`) over BigQuery/rollup data, delivered as explainable reports.

**User stories**
- As an owner, I want a 14-day revenue forecast per branch so that I can plan cash and purchasing.
- As a manager, I want predicted ingredient depletion dates so that I reorder before stock-outs.
- As an owner, I want to know which menu items to promote, re-price, or retire so that margin improves.
- As a manager, I want recommended staffing levels per shift so that labor matches demand.

**Features & acceptance criteria**

| Capability | Behavior & acceptance |
|---|---|
| Revenue forecast | Statistical baseline (seasonal-weekly model computed in pipeline) + AI narrative explaining drivers; per branch, 14-day horizon, daily granularity, confidence band; backtest MAPE displayed honestly; refreshed nightly. |
| Inventory predictions | Consumption rate per inventory item derived from order item↔ingredient mapping + manual stock counts; predicted stock-out date; reorder suggestions with quantities; alert when predicted stock-out < lead time. |
| Menu optimization | Quadrant analysis (popularity × margin → stars/plowhorses/puzzles/dogs); concrete recommendations ("raise X by 0.25 JOD — demand inelastic in your data", "bundle Y with Z — 31% co-order rate") each citing the underlying numbers; never auto-applies — one-tap apply with confirmation. |
| Staffing recommendations | Demand curve per hour vs historical prep/response SLA breaches → suggested waiter/kitchen headcount per shift; exportable to schedule. |
| Ask-the-data chat | Owner asks free-form questions ("compare Fridays in Ramadan vs after"); AI answers via whitelisted, parameterized query tools over rollups — never raw SQL from the model; every numeric claim traceable to a query result shown in an expandable "data used" panel. |
| Trust rules | All BI outputs labeled AI-generated, show data window used, and degrade to "insufficient data" below thresholds (≥28 days history for forecasts). |

**Edge cases:** menu churn breaking item history (lineage by item ID; renamed items keep history); holidays/Ramadan regime shifts (calendar feature flags in the model; AI narrative cautions); inventory not maintained by staff (module shows data-quality score and disables predictions below it); hallucinated numbers (hard rule: numbers come only from tool results; eval suite checks narrative figures match query outputs).

**i18n:** reports generated in viewer language; numbers/dates localized.
**Offline/degraded:** reports cached; generation requires connectivity; provider fallback may reduce narrative quality (flagged).

---

## 10. CRM (Customer Relationship Management)

**Purpose:** Opt-in identity layer turning anonymous diners into known guests: history, preferences, allergies, favorites, loyalty points, visit frequency.

**User stories**
- As a customer, I want to optionally save my profile with my phone number so that I get my favorites and points everywhere this restaurant operates.
- As a customer, I want my allergies remembered so that every order is checked automatically.
- As an owner, I want loyalty points per JOD spent so that customers return.
- As a manager, I want to see a guest's history when they complain so that I respond informed.

**Features & acceptance criteria**

| Feature | Acceptance criteria |
|---|---|
| Opt-in enrollment | Post-order prompt: phone + OTP (Firebase phone auth); explicit consent checkboxes (profile, marketing — separate); decline never re-prompted within 30 days. |
| Identity | One platform customer record keyed by verified phone; per-restaurant profile (points, preferences, visits) — restaurant A never sees restaurant B data. |
| Order history | All completed orders at this restaurant; one-tap reorder (re-validates availability/prices). |
| Preferences & allergies | Structured allergy list (drives AI guard §1) + free-text preferences; editable by customer; staff see allergy flags on tickets. |
| Favorites | Explicit hearts + computed favorites (≥3 orders of item); surface in PWA and AI context. |
| Loyalty points | Configurable earn rate (default 1 pt / 1 JOD on COMPLETED orders); redemption as discount items in menu (configurable catalog); points ledger append-only; expiry policy configurable (default 12 months, with notification). |
| Visit frequency | visits/{visitId} per table session; frequency tier (new / occasional / regular / VIP) computed nightly; tier visible to staff. |
| Privacy | Customer can export and delete their data (self-serve, see security doc); deletion anonymizes orders (keeps revenue stats, removes identity). |

**Edge cases:** shared phone (last OTP wins; profile is per-phone by design); points on refunded order (compensating negative ledger entry; balance can't go below 0 — residual flagged); redemption race (transactional redeem); cross-branch points (restaurant-level, valid at all branches); staff abuse of customer data (all CRM profile reads by staff are audit-logged).

**i18n:** all CRM surfaces bilingual; OTP SMS template localized.
**Offline/degraded:** CRM features require connectivity; AI falls back to session-only context without CRM.
