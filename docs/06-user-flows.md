# Firefly X TalkTable — 06 · User Flows

> Production specification — step-by-step flows for all 8 user types, with ASCII flow diagrams, state transitions, and error/edge handling. All flows are bilingual (Arabic RTL first-class, English) and mobile-first unless noted.

---

## Conventions

- `[Screen]` — a rendered screen/route.
- `(Action)` — a user action.
- `{System}` — automatic system behavior (Cloud Function, Firestore trigger, AI call).
- `<<event>>` — realtime event broadcast (Firestore listener / FCM push).
- Order status machine (canonical, used everywhere):

```
PLACED → ACCEPTED → PREPARING → READY → SERVED → BILL_REQUESTED → PAID → CLOSED
                └→ REJECTED (terminal, with reason)
        └→ CANCELLED (customer-initiated, only while PLACED)
```

- Waiter request machine: `OPEN → ACKNOWLEDGED → RESOLVED` (auto-escalates to manager after SLA breach: 3 min unacknowledged).

---

## 1. Customer Flow (end-to-end)

### 1.1 QR Scan → Landing

1. Customer scans table QR with phone camera. QR encodes `https://app.fireflyx.io/r/{slug}/{tableToken}`.
2. {System} `GET /r/[slug]/[tableToken]` validates the token against the `tables` collection: token exists, table is `active`, restaurant subscription is `active`.
3. {System} Creates/resumes an anonymous **table session** (Firebase anonymous auth + `sessions/{sessionId}` doc bound to tableId, TTL 4h, refreshed on activity). Multiple devices on the same table join the same session cart (shared cart toggle per restaurant setting).
4. [Landing] renders: restaurant logo, hero image, table number badge, and two primary CTAs — **"Talk to order" (AI)** and **"Browse menu"**.
5. If token invalid/expired → [Error: "This table code is no longer valid — please ask staff for help"] with a "Call waiter" fallback button that posts an anonymous OPEN request tagged `qr_issue`.

### 1.2 Language Select

6. First visit: full-screen language sheet (no dismiss without choice): **العربية** / **English**, large tap targets, each label rendered in its own script.
7. Choice persisted to `localStorage` + session doc; `<html dir>` flips to `rtl` for Arabic; all subsequent AI replies are generated in the chosen language.
8. Switchable at any time via the persistent `LanguageSwitch` in the top bar (no page reload; instant re-render).

### 1.3 AI Chat (text)

9. (Tap "Talk to order") → [AI Chat]. Greeting bubble streams in: personalized if returning customer (CRM phone-number match), otherwise generic ("أهلاً! I'm the menu assistant for {restaurant}…").
10. Customer types free text: questions ("is the burger spicy?"), dietary filters ("vegan options?"), or direct orders ("2 shawarma, one without garlic").
11. {System} `POST /api/ai/chat` → provider abstraction (`packages/ai`) → LLM with tool calling: `search_menu`, `add_to_cart`, `remove_from_cart`, `get_item_details`, `request_waiter`, `get_order_status`. Knowledge base (restaurant FAQ docs) injected via retrieval.
12. AI tool calls that mutate the cart render **inline cart chips** in the chat ("Added 2× Shawarma — 7.00 JOD") with undo.
13. Suggested-reply chips under input ("Show desserts", "What's popular?", "Checkout").
14. (Tap "Checkout" chip or cart FAB) → 1.6 Cart.

### 1.4 Voice Ordering

15. (Tap mic icon in chat input) → [Voice Mode]: full-screen takeover with `VoiceOrb` (idle → listening pulse).
16. Browser mic permission requested once; denial → toast + fall back to text with explanation.
17. Customer speaks (Arabic dialects incl. Jordanian, or English). {System} streams audio → STT → transcript rendered live (partial results, dimmed until final).
18. Final transcript runs through the same chat pipeline (step 11). AI response is rendered as text **and** spoken via TTS (toggleable; default ON in voice mode).
19. Orb states: `idle → listening → thinking (orb morphs to spinner) → speaking (waveform) → idle`.
20. (Swipe down / tap ×) returns to text chat with full transcript preserved in the thread.

### 1.5 Menu Browse

21. (Tap "Browse menu") → [Menu Grid]: sticky category pill bar (horizontally scrollable, RTL-aware), grid of `MenuItemCard`s (image, name, price in JOD, dietary badges, "86'd" items shown greyed with "Sold out" pill — never hidden, to avoid confusion with AI mentions).
22. (Tap item) → [Item Detail Sheet] (bottom sheet): gallery, description, allergens, modifier groups (radio/checkbox, min/max enforced), special-instructions text field, `QuantityStepper`, sticky "Add — X.XX JOD" button.
23. (Add) → sheet dismisses with spring animation; cart FAB badge increments with a count-pop.

### 1.6 Cart → Place Order

24. (Tap cart FAB) → [Cart]: `CartLine` rows (qty stepper, swipe-to-delete with RTL-mirrored swipe direction), modifier summaries, subtotal, service charge %, tax, total. Optional name/phone field ("for loyalty & order updates" — feeds CRM).
25. (Tap "Place order") → confirm dialog if cart > configurable threshold (default 50 JOD) to catch mistakes.
26. {System} Creates `orders/{orderId}` doc with status `PLACED`, line-item snapshot (prices frozen), sessionId, tableId. Server-side revalidation: every item still available, prices match — mismatch returns a diff dialog ("Hummus price changed 2.50→2.75, continue?").
27. <<event>> Kitchen display + waiter app receive the new order in <1s.

### 1.7 Live Tracking

28. [Order Tracking] auto-opens: vertical stepper `Placed → Accepted → Preparing → Ready → Served`, each transition animates (checkmark draw + step fill), with estimated time from kitchen's accepted ETA.
29. Customer may add a second order at any time (cart restarts; orders list shows both).
30. (Cancel) available only while `PLACED`; after `ACCEPTED` the button becomes "Ask waiter to change order" (posts a tagged request).

### 1.8 Request Waiter / Bill / Water

31. Persistent "Help" FAB → action sheet: **Call waiter**, **Water**, **Bill**, **Other (free text → AI triage)**.
32. {System} Creates `waiterRequests/{id}` `OPEN`; UI shows "✓ Waiter notified" with a live status chip (Open → On the way → Done) bound to the request doc.
33. Duplicate-tap protection: same request type throttled to 1 per 90s with a friendly "Already on the way!" toast.

### 1.9 Pay

34. (Bill requested) → cashier flow (§4) computes the final bill; <<event>> customer sees [Payment] with itemized bill.
35. Payment options (restaurant-configurable): **Pay at counter / cash**, **Card with waiter (terminal)**, **Pay now (Stripe)** — Apple Pay / Google Pay / card sheet.
36. Stripe path: PaymentIntent created server-side (amount locked to bill), 3DS handled in-sheet; success → animated receipt screen + optional SMS/email receipt.
37. Split bill: equal-split (choose N) or by-items (checkbox per line); each split generates its own PaymentIntent.

### 1.10 Feedback

38. After status `PAID` → [Feedback]: 5-star `RatingStars` (one tap submits), optional tags ("Food", "Speed", "Service", "AI assistant"), optional comment.
39. ≤3 stars triggers a soft prompt "Sorry! What went wrong?" and flags the manager dashboard in realtime.
40. ≥4 stars (configurable) → "Share on Google" deep link. Session ends with a thank-you screen; table token session marked `CLOSED`.

```
┌────────┐  ┌─────────┐  ┌──────────┐   ┌─────────────────────────┐
│QR Scan │→│ Landing  │→│ Language │→ ┌→│ AI Chat ⇄ Voice Mode    │
└────────┘  └─────────┘  └──────────┘ │ └────────────┬────────────┘
                              │       │              │ add via tools
                              └───────┤ ┌────────────▼────────────┐
                                      └→│ Menu Grid → Item Sheet  │
                                        └────────────┬────────────┘
                                                     ▼
        ┌──────────┐   ┌─────────────┐   ┌────────┐  ┌──────┐
        │ Feedback │ ← │ Pay (Stripe │ ← │ Bill   │ ←│ Cart │→ Place Order
        └──────────┘   │ /cash/card) │   │Request │  └──────┘      │
                       └─────────────┘   └────────┘        ┌───────▼───────┐
                              ▲   Help FAB: waiter/water ← │ Live Tracking │
                              └────────────────────────────└───────────────┘
```

---

## 2. Waiter Flow

1. [Login] — email/password (Firebase Auth, role claim `waiter`, branch-scoped). First login forces password change. PIN quick-unlock for shared devices (4-digit, per-shift).
2. → [Table Map]: grid/floor view of `TableMapTile`s color-coded: grey=empty, blue=seated/browsing, orange pulse=open request, green=order in progress, purple=bill requested, red=SLA breach.
3. <<event>> New request → tile pulses + sound + push notification (if app backgrounded). Request center drawer lists all OPEN/ACKNOWLEDGED requests sorted by age, with table, type icon, elapsed timer.
4. (Tap request) → detail card → (Acknowledge) sets `ACKNOWLEDGED` (customer chip flips to "On the way"). (Resolve) after handling sets `RESOLVED`.
5. **Serve order**: kitchen sets `READY` → waiter's "Ready to serve" queue lights up → (Pick up) → walks food out → (Mark served) → order `SERVED`, customer tracker completes.
6. **Close table**: after `PAID`, table tile shows "Needs reset" → (Tap table → Close table) → confirms bill settled (cashier flag), clears session, table → grey. Unsettled bill blocks closing with a warning.
7. Shift end: (Profile → End shift) — summary of tables served, avg ack time, tips (if tracked).

```
[Login]→[Table Map]──<<request>>──→[Request Card]→(Ack)→(Resolve)
            │ ──<<order READY>>──→[Serve Queue]→(Pick up)→(Mark served)
            └──after PAID────────→(Close table)→ tile grey
```

---

## 3. Kitchen Flow

1. [Login] (role `kitchen`, branch-scoped; tablet/wall display, dark mode forced, large type).
2. [Kitchen Display Board]: columns **New / Preparing / Ready**, each order an `OrderTicket` (table #, elapsed timer with amber>10min red>15min, line items with modifiers bolded, allergy notes highlighted red).
3. <<event>> New order arrives in **New** with chime + slide-in.
4. (Accept) — optionally set ETA (preset chips 10/15/20/30 min) → status `ACCEPTED`; customer tracker advances. (Reject) → §8.4.
5. (Start) → `PREPARING` (auto on Accept if restaurant setting "single-tap mode").
6. (Done) → `READY` → ticket moves to Ready column, waiter notified; ticket shows "waiting for pickup" timer.
7. Waiter marks served → ticket auto-clears (kept in "Recent" tab 30 min for disputes).
8. Item-level workflow (optional, per restaurant): each line item checkable; ticket auto-advances when all checked.
9. 86 shortcut: long-press any item on a ticket → "Mark sold out" → instantly 86'd menu-wide (manager notified).

```
<<order PLACED>>→[NEW]─(Accept±ETA)→[PREPARING]─(Done)→[READY]─<<waiter serves>>→ cleared
                   └─(Reject+reason)→ REJECTED → customer + waiter alerted
```

---

## 4. Cashier Flow

1. [Login] (role `cashier`) → [POS View]: open tables list with running totals, bill-request queue (purple badges).
2. <<event>> Bill request from table 12 → queue item appears; (Tap) → [Bill Builder]: all `SERVED` orders for the session aggregated, line items, service %, tax, manual discount (PIN-gated above threshold), final total.
3. (Finalize bill) → bill locked, pushed to customer device (<<event>> customer [Payment] screen).
4. Payment capture, one of:
   - **Cash**: (Tendered amount) → change calculated → (Confirm cash).
   - **Card (terminal)**: external POS terminal; cashier enters auth ref → (Confirm card).
   - **Stripe (customer device)**: cashier waits; <<event>> webhook `payment_intent.succeeded` auto-marks paid.
5. {System} On payment confirmation: order(s) → `PAID`; receipt generated (PDF + on-screen + optional thermal print via local print bridge), customer gets feedback prompt.
6. (Mark order completed) → orders → `CLOSED`.
7. {System} **Platform billing event**: a Cloud Function trigger on order transition to `CLOSED` writes an immutable `billingEvents/{id}` doc: `{restaurantId, branchId, orderId, amount: 0.10, currency: "JOD", ts}`. Idempotent (keyed by orderId). Aggregated nightly into the restaurant's monthly statement. Voided/rejected orders never bill.

```
<<BILL_REQUESTED>>→[Queue]→[Bill Builder]→(Finalize)
   →┬(Cash: tender→change)┐
    ├(Card: terminal ref) ├→ PAID → Receipt → (Complete) → CLOSED
    └(Stripe: auto-webhook)┘                      │
                              {fn: write 0.10 JOD billingEvent (idempotent)}
```

---

## 5. Branch Manager Flow (daily ops)

1. [Login] (role `manager`, single branch) → [Branch Dashboard]: today's KPIs (revenue, orders, avg ticket, avg prep time, open requests, rating), live order feed, alert strip.
2. **Morning review**: yesterday vs same-day-last-week deltas, low-rated feedback list (tap → full session replay: orders + chat transcript).
3. **Menu 86'ing**: [Menu Manager] → search/filter → toggle "Available" off per item or variant → instantly reflected on customer menu + AI knowledge ("sorry, sold out today") + kitchen. Bulk 86 by category. Auto-un-86 at next-day open (optional toggle).
4. **Staff shift view**: [Staff] → today's roster (who's clocked in, role, ack-time stats), reassign waiter table zones via drag, see SLA breaches per waiter.
5. **Inventory alerts**: low-stock items (linked ingredients below threshold) raise dashboard alerts; (Tap alert) → adjust stock count or one-tap 86 linked menu items.
6. End of day: (Daily close report) → emailed PDF: revenue by method, top items, AI deflection stats, staff summary.

---

## 6. Restaurant Owner Flow

1. [Login] (role `owner`, all branches) → [Owner Overview]: portfolio KPIs across branches, sparkline trends, map/list of branches with health dots.
2. → [Branch Comparison]: side-by-side table + charts (revenue, avg ticket, prep time, rating, AI usage) over selectable range; sortable, exportable CSV.
3. → [AI Insights]: weekly LLM-generated narrative ("Friday dinner revenue at Abdoun branch dropped 12%; correlated with 4 86'd best-sellers…") with linked evidence cards; (Ask follow-up) opens an analytics chat grounded in the owner's own data only.
4. → [Billing Statement]: monthly platform invoice — completed-order count × 0.10 JOD per branch, daily breakdown chart, downloadable PDF/CSV, dispute button (opens support ticket pre-filled with statement line refs), payment method management (Stripe).
5. Owner can drill into any branch and assume read-only manager view; mutations require explicit "act as manager" toggle (audited).

---

## 7. Platform Admin / Super Admin Flows

### 7.1 Restaurant Onboarding Wizard (Platform Admin)

1. [Admin Console → Restaurants → New] — 6-step wizard:
   1. **Identity**: name (ar/en), slug, logo, brand color, cuisine, country/city, timezone, currency.
   2. **Owner account**: email invite → owner sets password via magic link.
   3. **Branches & tables**: per branch: address, floor layout (table count → auto-generate table tokens + QR PDFs).
   4. **Menu import**: CSV/Excel upload or manual; AI-assisted parse of an existing PDF menu (review screen before commit).
   5. **AI setup**: knowledge base seed docs, tone preset, languages, voice on/off.
   6. **Go-live checklist**: test order on a sandbox table, Stripe Connect onboarding status, QR print confirmation → (Activate).
2. {System} Activation provisions Firestore docs, security-rule role claims, default settings, and starts the billing meter.

### 7.2 Monitoring

3. [Admin → Monitoring]: platform health — orders/min, AI latency p95, error rate, function cold starts, per-restaurant AI token usage with anomaly flags; restaurant detail page shows live order stream (PII-redacted), config, and feature flags.

### 7.3 Support Ticket

4. Tickets arrive from owner dashboards / email. [Admin → Support]: queue with severity, restaurant link, conversation thread, internal notes, status `open → in_progress → waiting_customer → resolved`. Super Admin can escalate to engineering with full context bundle (session replay link, logs).

### 7.4 Billing Reconciliation (Super Admin)

5. [Admin → Billing]: monthly run — for each restaurant: `billingEvents` sum vs `CLOSED` order count (must match; mismatches flagged). Generate invoices → Stripe; track paid/overdue; dunning automation; manual credit notes (audited, requires reason). Export ledger to accounting CSV.

Super Admin additionally: platform admin user management, feature flags, kill switches (disable AI globally / per restaurant), data deletion requests (GDPR-style), audit log viewer.

---

## 8. Error & Edge Flows

### 8.1 AI Unavailable Fallback

```
(send msg)→{AI call}→ timeout/5xx ×2 retries (backoff)
  → ChatBubble: "Assistant is taking a break 😴 — browse the menu or call a waiter"
  → buttons: [Browse menu] [Call waiter]; chat input stays usable for retry
  → {System} marks provider degraded; circuit breaker routes next calls to
    fallback provider in packages/ai; menu browse + ordering fully functional
    without AI (AI is enhancement, never a hard dependency for ordering).
```

### 8.2 Offline Customer Device

- Service worker caches menu + assets; cart persisted in IndexedDB.
- Connectivity loss → persistent amber banner "You're offline — cart saved".
- "Place order" disabled offline (no optimistic order placement — kitchen must confirm); on reconnect, banner flips green, cart revalidated against live prices/availability with a diff dialog if changed.
- Order tracking shows last-known state with "as of HH:MM" stamp.

### 8.3 Payment Failure

- Stripe decline → in-sheet error with mapped human message (insufficient funds / 3DS failed / network) → retry with same or different method, or fall back to "Pay at counter" (cashier notified the online attempt failed).
- Webhook missing after client-side success (rare): order shows "Confirming payment…" up to 60s; then cashier prompt to verify in Stripe dashboard; never double-charge — PaymentIntent reused, not recreated.

### 8.4 Kitchen Rejects Order

```
[NEW ticket]→(Reject)→ reason picker (Sold out item / Closing / Cannot fulfill / Other+text)
  → order REJECTED
  → <<event>> customer: full-screen apologetic card with reason, items returned
    to an editable cart ("Remove the sold-out item and resend?")
  → <<event>> waiter notified to visit the table (auto OPEN request, tagged)
  → if reason = sold-out item → that item auto-86'd, manager alerted
  → no billing event ever fires for rejected orders.
```

### 8.5 Misc edges (specified, enforced)

- **Token reuse after table closed**: scanning the same QR starts a fresh session; previous session data inaccessible.
- **Two devices, one table**: shared session cart with realtime merge; both see "Placed by table" attribution.
- **Mid-order 86**: item 86'd while in someone's cart → cart line flagged red on next interaction + blocked at place-order validation.
- **Staff token expiry mid-shift**: silent refresh; on hard failure, PIN re-unlock without losing screen state.
- **Restaurant subscription suspended**: customer QR shows graceful "Ordering temporarily unavailable — please order with staff"; staff dashboards show suspension banner with billing CTA.
