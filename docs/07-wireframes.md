# Firefly X TalkTable — 07 · Wireframes

> ASCII wireframes (box-drawing) for every key screen. Mobile-first; desktop variants where the role uses larger screens. Each wireframe is annotated with **Interactions**, **Motion** (Framer Motion), **Empty state**, **Loading**, and **RTL** notes.
>
> Visual language reminder: Firefly black `#04040A` surfaces, orange `#FF6B00` accents, glass panels (`backdrop-blur`, 1px white/8% border), generous radius (16–24px), Stripe/Linear-grade restraint.

---

## A. CUSTOMER (mobile, dark default)

### A1. Landing (`/r/[slug]/[tableToken]`)

```
┌──────────────────────────────┐
│  ◐ ar/EN            Table 12 │  ← top bar: LanguageSwitch · table badge
│                              │
│        ╭──────────╮          │
│        │  (logo)  │          │  hero: restaurant logo on glass card,
│        ╰──────────╯          │  blurred food photo behind
│      Shams Al-Balad          │
│   "Levantine kitchen"        │
│                              │
│ ┌──────────────────────────┐ │
│ │  🎙  Talk to order  (AI) │ │  ← primary, orange, full-width
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │  📖  Browse menu         │ │  ← secondary, glass outline
│ └──────────────────────────┘ │
│                              │
│  Open · 12:00–23:00  ⭐ 4.7  │
└──────────────────────────────┘
```
- **Interactions**: both CTAs route; table badge tap → "You're at table 12" tooltip.
- **Motion**: logo card `scale 0.96→1, opacity 0→1` (spring, 0.4s); CTAs stagger in 80ms apart (`y: 12→0`).
- **Empty**: n/a (token errors get a dedicated error screen with Call-waiter fallback).
- **Loading**: skeleton — logo circle + 2 button-shaped shimmer bars.
- **RTL**: badge moves to left, language switch to right; logical properties only.

### A2. AI Chat

```
┌──────────────────────────────┐
│ ←   Shams Al-Balad   🛒(2)   │
│──────────────────────────────│
│ ╭─ AI ────────────────────╮  │
│ │ أهلاً! What can I get   │  │  ← assistant bubble: glass, left
│ │ you today?              │  │     (right in RTL)
│ ╰─────────────────────────╯  │
│        ╭─────────── you ─╮   │
│        │ 2 shawarma, one │   │  ← user bubble: orange tint, right
│        │ without garlic  │   │
│        ╰─────────────────╯   │
│ ╭─ AI ────────────────────╮  │
│ │ Added 2× Shawarma 7.00  │  │
│ │ ┌─[cart chip]─────[↺]─┐ │  │  ← inline cart chip w/ undo
│ ╰─────────────────────────╯  │
│ (Show desserts)(What's hot?) │  ← suggestion chips, h-scroll
│──────────────────────────────│
│ [ Type a message…    ] 🎙 ➤ │  ← input · mic · send
└──────────────────────────────┘
```
- **Interactions**: chips insert text; mic → A3; cart icon → A6; long-press bubble → copy.
- **Motion**: bubbles `y:8→0 + fade` on mount; streaming text per-token; typing indicator = 3 dots scaling loop; cart badge `scale 1→1.3→1` on add.
- **Empty**: greeting bubble + 3 starter chips ("What's popular?", "Vegan options", "Show menu").
- **Loading**: assistant typing indicator; never block input.
- **RTL**: bubble sides mirror; send icon mirrors (points left); Arabic text `dir=auto` per bubble for mixed-language threads.

### A3. Voice Mode (listening)

```
┌──────────────────────────────┐
│              ×               │
│                              │
│         ╭────────╮           │
│        ╱  ◉◉◉◉◉  ╲          │   VoiceOrb: concentric rings,
│       │  ◉ ORB ◉  │          │   orange core, pulsing
│        ╲  ◉◉◉◉◉  ╱          │
│         ╰────────╯           │
│                              │
│      "اثنين شاورما و…"       │   ← live partial transcript (dimmed)
│                              │
│        Listening…            │
│   [⌨ type instead]  [🔇 TTS] │
└──────────────────────────────┘
```
- **Interactions**: tap orb = stop/submit; swipe down or × = back to chat; TTS toggle persists.
- **Motion**: orb rings scale with mic amplitude (spring-linked); state morphs: listening (pulse) → thinking (rotate shimmer) → speaking (waveform bars). Enter/exit = full-screen `opacity+scale 0.98` 250ms.
- **Empty/error**: mic denied → card "Microphone blocked — enable in browser settings" + type-instead CTA.
- **Loading**: thinking state IS the loading state.
- **RTL**: transcript right-aligned; controls mirror.

### A4. Menu Grid

```
┌──────────────────────────────┐
│ ←  Menu          🔍   🛒(2)  │
│ (All)(Mezze)(Grill)(Drinks)→ │  ← sticky category pills
│──────────────────────────────│
│ ┌──────────┐  ┌──────────┐   │
│ │ [photo]  │  │ [photo]  │   │
│ │ Hummus   │  │ Shawarma │   │  MenuItemCard:
│ │ 2.50 JOD │  │ 3.50 JOD │   │  image, name, price,
│ │ 🌱       │  │ 🔥popular│   │  badges
│ └──────────┘  └──────────┘   │
│ ┌──────────┐  ┌──────────┐   │
│ │ [photo]  │  │ ░greyed░ │   │
│ │ Fattoush │  │ Kibbeh   │   │  ← 86'd: greyed +
│ │ 3.00 JOD │  │ SOLD OUT │   │    "Sold out" pill
│ └──────────┘  └──────────┘   │
│            ( 🛒 View cart 2 )│  ← floating bar when cart>0
└──────────────────────────────┘
```
- **Interactions**: pill tap scroll-spies to section; search overlays fuzzy results; card tap → A5; sold-out cards not tappable (tooltip "Back tomorrow").
- **Motion**: cards stagger-fade per section (40ms); pill indicator slides (layoutId); cart bar slides up from bottom.
- **Empty**: category with no items → illustration + "Nothing here yet".
- **Loading**: 6 card skeletons (image block + 2 text bars) shimmering.
- **RTL**: pill bar scrolls from right; grid order RTL; price stays Western digits (configurable Arabic-Indic toggle).

### A5. Item Detail Sheet

```
┌──────────────────────────────┐
│            ───               │ ← grab handle
│ ┌──────────────────────────┐ │
│ │       [photo 16:9]       │ │
│ └──────────────────────────┘ │
│ Shawarma Plate     3.50 JOD  │
│ Marinated chicken, garlic…   │
│ ⚠ contains: gluten, sesame   │
│──────────────────────────────│
│ Bread (choose 1)*            │
│  (•) Saj    ( ) Kmaj         │
│ Extras                       │
│  [ ] Extra garlic +0.25      │
│  [ ] Pickles    +0.25        │
│ ┌ Special instructions…    ┐ │
│──────────────────────────────│
│  [−  2  +]   [Add · 7.25 JOD]│ ← sticky footer
└──────────────────────────────┘
```
- **Interactions**: drag-to-dismiss; required groups gate the Add button (disabled + reason).
- **Motion**: sheet spring up (`damping 28`); Add success → button morphs to ✓ then sheet dismisses; price in button animates with number-ticker on changes.
- **Empty**: no modifiers → section omitted entirely.
- **Loading**: photo blur-up; modifiers skeleton rows.
- **RTL**: stepper order mirrors (− on right); checkbox/radio leading-edge aligned.

### A6. Cart

```
┌──────────────────────────────┐
│ ←  Your order       Table 12 │
│──────────────────────────────│
│ 2× Shawarma Plate    7.00    │
│    saj · extra garlic        │
│    [− 2 +]          (swipe⌫) │
│ 1× Hummus            2.50    │
│    [− 1 +]                   │
│──────────────────────────────│
│ ┌ Name & phone (optional) ─┐ │
│──────────────────────────────│
│ Subtotal             9.50    │
│ Service (10%)        0.95    │
│ Total           10.45 JOD    │
│ ┌──────────────────────────┐ │
│ │     Place order  →       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```
- **Motion**: line removal = swipe + collapse (height auto-animate); total number-ticker.
- **Empty**: bag illustration + "Your cart is empty" + [Browse menu] + [Ask the AI].
- **Loading**: revalidation spinner inside Place-order button only.
- **RTL**: swipe-to-delete direction mirrors; amounts right-aligned column stays consistent.

### A7. Order Tracking

```
┌──────────────────────────────┐
│ Order #1042         Table 12 │
│──────────────────────────────│
│  ● Placed        12:31  ✓    │
│  ● Accepted      12:32  ✓    │
│  ◉ Preparing     ~15 min     │  ← active step pulses orange
│  ○ Ready                     │
│  ○ Served                    │
│──────────────────────────────│
│ 2× Shawarma · 1× Hummus      │
│ Total 10.45 JOD              │
│ [ + Add more items ]         │
│         (🆘 Help FAB)        │
└──────────────────────────────┘
```
- **Motion**: step transitions: connector line fills (pathLength 0→1, 0.6s), check draws; subtle confetti micro-burst on READY.
- **Empty**: no active orders → "No orders yet" + CTA.
- **Loading**: stepper skeleton.
- **RTL**: stepper rail flips to right edge; times left-aligned.

### A8. Payment

```
┌──────────────────────────────┐
│ Your bill           Table 12 │
│ 2× Shawarma          7.00    │
│ 1× Hummus            2.50    │
│ Service · Tax        1.45    │
│ TOTAL           10.95 JOD    │
│──────────────────────────────│
│ ┌  Pay now ( Pay / G Pay)─┐ │
│ ┌──── Pay with card ───────┐ │
│ ┌─── Pay at counter ───────┐ │
│   Split bill ▾               │
└──────────────────────────────┘
```
- **Motion**: success → full-screen check draw + receipt card slide-up.
- **Error**: decline → shake on method card + human-readable message.
- **Loading**: selected method button shows inline spinner; others disabled.
- **RTL**: amounts column anchored; method icons leading edge.

### A9. Feedback

```
┌──────────────────────────────┐
│        Thank you! 🧡         │
│   How was everything?        │
│     ☆  ☆  ☆  ☆  ☆           │
│ (Food)(Speed)(Service)(AI)   │
│ ┌ Tell us more (optional)──┐ │
│ │        Submit            │ │
└──────────────────────────────┘
```
- **Motion**: stars fill with sequential spring pop on tap; submit → heart burst.
- **Empty/skip**: "Skip" text link; never blocks exit.
- **RTL**: stars order mirrors (rating value unaffected).

---

## B. STAFF

### B1. Staff Login (mobile + tablet)

```
┌──────────────────────────────┐
│         🟠 Firefly X         │
│        TalkTable Staff       │
│ ┌ Email ──────────────────┐  │
│ ┌ Password ──────────⊙────┐  │
│ │         Sign in          │ │
│   Forgot password?           │
│ ── or quick unlock ──        │
│      [ • • • • ]  PIN        │
└──────────────────────────────┘
```
- **Motion**: card fade-up; error shake; PIN dots fill.
- **Loading**: button spinner. **RTL**: labels/icons mirror; email field stays LTR input.

### B2. Kitchen Display Board (desktop/tablet landscape)

```
┌────────────────────────────────────────────────────────────────────┐
│ 🟠 KITCHEN — Abdoun        New: 2  Prep: 3  Ready: 1     🔔  ⏻    │
├──────── NEW ────────┬────── PREPARING ──────┬──────── READY ───────┤
│ ┌─#1042 · T12 1:20─┐│ ┌─#1040 · T03  8:12─┐ │ ┌─#1038 · T07 0:45─┐ │
│ │ 2× Shawarma      ││ │ 1× Mixed Grill    │ │ │ 2× Fattoush      │ │
│ │  · no garlic     ││ │ 2× Hummus         │ │ │ waiting pickup…  │ │
│ │ ⚠ NUT ALLERGY    ││ │ [    DONE ✓    ]  │ │ └──────────────────┘ │
│ │ [REJECT][ACCEPT] ││ └───────────────────┘ │                      │
│ └──────────────────┘│ ┌─#1041 · T05 12:40─┐ │                      │
│ ┌─#1043 · T01 0:15─┐│ │ ░amber: >10 min░  │ │                      │
│ └──────────────────┘│ └───────────────────┘ │                      │
└────────────────────────────────────────────────────────────────────┘
```
- **Interactions**: huge tap targets; Accept opens ETA chips (10/15/20/30); long-press line item → 86; "Recent" tab in header.
- **Motion**: new ticket slides in from column top + chime; column moves use `layout` animation; timer color tween green→amber→red.
- **Empty**: per column — "No orders 🍳 all caught up".
- **Loading**: 2 ticket skeletons per column.
- **RTL**: column order mirrors (New on right); timers keep Western digits.

### B3. Waiter Table Map + Request Center (mobile)

```
┌──────────────────────────────┐
│ 🟠 Floor — Abdoun     🔔(3)  │
│──────────────────────────────│
│ ┌T01┐ ┌T02┐ ┌T03┐ ┌T04┐      │   tile colors:
│ │ ░ │ │ ● │ │ ◉!│ │ ● │      │   ░ empty  ● active
│ └───┘ └───┘ └───┘ └───┘      │   ◉! pulsing request
│ ┌T05┐ ┌T06┐ ┌T07┐ ┌T08┐      │   ▣ bill requested
│ │ ▣ │ │ ░ │ │ ● │ │ ░ │      │
│ └───┘ └───┘ └───┘ └───┘      │
│──── Requests (3) ────────────│
│ 💧 T03 · Water        0:42 ▸ │
│ 🧾 T05 · Bill         1:10 ▸ │
│ 🙋 T07 · Waiter  ░2:55 SLA░ ▸│  ← red as SLA nears
│──────────────────────────────│
│ [Floor] [Requests] [Serve(1)]│  ← bottom tabs
└──────────────────────────────┘
```
- **Interactions**: tile tap → table sheet (orders, requests, close-table); request swipe-right = Acknowledge, tap → detail with Resolve.
- **Motion**: request tiles pulse (scale 1↔1.04, 1.2s loop); ack swipe springs; new request slides into list + haptic.
- **Empty**: "No open requests — nice work ✨".
- **Loading**: tile grid skeleton.
- **RTL**: grid flows RTL; swipe-to-ack direction mirrors; bottom tab order mirrors.

### B4. Cashier POS View (desktop)

```
┌────────────────────────────────────────────────────────────────┐
│ 🟠 Cashier — Abdoun                        Shift: 09:00  🔔(1) │
├───────── OPEN TABLES ─────────┬──────── BILL — TABLE 05 ───────┤
│ T03  2 orders   14.50  ●      │ 1× Mixed Grill        9.50     │
│ T05  1 order    11.45  ▣ BILL │ 1× Lemon mint         2.00     │
│ T07  1 order     8.25  ●      │ Service 10%           1.15     │
│ T12  2 orders   10.45  ●      │ Discount   [ 0.00 ] 🔒         │
│                               │ TOTAL            12.65 JOD     │
│                               │ [CASH] [CARD] [⌛ Stripe…]      │
│                               │ Tendered [ 15.00 ] → chg 2.35  │
│                               │ [ Confirm payment ✓ ]          │
└───────────────────────────────┴────────────────────────────────┘
```
- **Interactions**: table row click loads bill; discount field PIN-locked; Stripe tile shows live "waiting for customer" spinner that auto-completes on webhook.
- **Motion**: bill panel crossfades per table; confirm → green sweep + receipt modal.
- **Empty**: right panel "Select a table to build a bill".
- **Loading**: rows skeleton; webhook wait = indeterminate bar.
- **RTL**: panels swap sides; numerals/amounts column alignment preserved.

---

## C. MANAGEMENT (desktop-first, responsive)

### C1. Owner Overview Dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▌🟠 Firefly X      [Overview][Branches][Insights][Billing]  ◐ 🔔 (W)│
│ ┌─Revenue today─┐┌─Orders──┐┌─Avg ticket─┐┌─Rating─┐                 │
│ │ 1,284 JOD ↑8% ││ 312 ↑4% ││ 4.12 JOD   ││ ⭐ 4.6 │   KPICards     │
│ └───────────────┘└─────────┘└────────────┘└────────┘                 │
│ ┌─ Revenue · 30d (line) ──────────────┐ ┌─ Branch health ─────────┐  │
│ │      ╱╲    ╱╲___╱╲                  │ │ ● Abdoun     OK         │  │
│ │  ___╱  ╲__╱       ╲╱╲              │ │ ● Sweifieh   OK         │  │
│ └─────────────────────────────────────┘ │ ◉ Madaba   2 alerts ▸   │  │
│ ┌─ Top items (bar) ─┐ ┌─ Pay mix (donut)┐└─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```
- **Motion**: KPI numbers count-up on mount; charts draw-in (pathLength); cards stagger 60ms.
- **Empty**: new account → onboarding checklist card replaces charts.
- **Loading**: KPI + chart skeletons (shimmer blocks matching final layout — no spinners).
- **RTL**: sidebar flips to right; charts keep LTR time axis (annotated), labels Arabic.

### C2. Branch Comparison

```
┌───────────────────────────────────────────────────────────┐
│ Compare branches      Range: [Last 30 days ▾]  [Export ⤓] │
│ ┌─────────────┬─ Abdoun ─┬─ Sweifieh ─┬─ Madaba ─┐        │
│ │ Revenue     │ 14,2k ↑  │ 11,8k ↑    │ 6,1k ↓   │        │
│ │ Orders      │ 3,4k     │ 2,9k       │ 1,5k     │        │
│ │ Avg prep    │ 11m      │ 13m        │ 18m ⚠    │        │
│ │ Rating      │ 4.7      │ 4.6        │ 4.1 ⚠    │        │
│ │ AI usage    │ 62%      │ 55%        │ 31%      │        │
│ └─────────────┴──────────┴────────────┴──────────┘        │
│ ┌ grouped bar chart: revenue by branch by week ┐          │
└───────────────────────────────────────────────────────────┘
```
- **Interactions**: column header click sorts; ⚠ cells tooltip with insight link; export CSV.
- **Motion**: sort reorders rows with layout animation.
- **Empty**: single-branch account → "Add a second branch to compare".
- **RTL**: table mirrors; first (sticky) column on right.

### C3. Analytics (manager/owner)

```
┌─────────────────────────────────────────────────────────┐
│ Analytics   [Today][7d][30d][Custom▾]                   │
│ ┌ Orders/hour heat strip 00–24 ┐                        │
│ ┌ Sales line ┐ ┌ Category donut ┐ ┌ AI vs manual bar ┐  │
│ ┌ Item table: name·sold·revenue·86count·rating ──────┐  │
└─────────────────────────────────────────────────────────┘
```
- Same chart/skeleton/motion rules as C1. **Empty**: "Not enough data yet — check back after your first day."

### C4. Menu Manager

```
┌──────────────────────────────────────────────────────────┐
│ Menu  [🔍 search] [+ Add item] [+ Category] [Bulk ▾]     │
│ ▾ Mezze (4)                                ⠿ drag        │
│   ⠿ Hummus       2.50 JOD   [Available ◉─]  ✎  ⋯        │
│   ⠿ Fattoush     3.00 JOD   [Available ◉─]  ✎  ⋯        │
│   ⠿ Kibbeh       3.25 JOD   [Sold out ─◯ ]  ✎  ⋯  ░row░ │
│ ▸ Grill (8)                                              │
└──────────────────────────────────────────────────────────┘
```
- **Interactions**: availability toggle = instant 86 (optimistic + toast w/ undo); drag reorder ⠿; ✎ opens item editor side panel (photos, ar/en fields side-by-side, modifiers, allergens, AI description generator button).
- **Motion**: toggle thumb spring; 86'd row desaturates; drag uses Reorder primitives.
- **Empty**: "Import your menu" card (CSV / PDF-AI parse).
- **RTL**: drag handles mirror; ar/en editor fields each keep native direction.

### C5. Employee Manager

```
┌────────────────────────────────────────────────────────┐
│ Staff   [+ Invite]                 Filter: [All roles▾]│
│ ┌ ◉ Lina H.   Waiter   Abdoun   ● on shift   avg-ack 38s  ⋯ │
│ ┌ ◉ Omar K.   Kitchen  Abdoun   ○ off        —             ⋯ │
│ ┌ ◉ Sara M.   Cashier  Abdoun   ● on shift   —             ⋯ │
└────────────────────────────────────────────────────────┘
```
- **Interactions**: row → profile drawer (role, branch, PIN reset, deactivate, shift history); invite = email + role + branch.
- **Empty**: "No staff yet — invite your team". **RTL**: avatar leading edge mirrors.

### C6. Inventory

```
┌────────────────────────────────────────────────────────┐
│ Inventory            ⚠ 3 low-stock alerts              │
│ Chicken breast   4.2 kg   min 5kg  ░LOW░  [Adjust][86▾]│
│ Tahini           12 jars  min 4    OK     [Adjust]     │
│ linked items: Shawarma, Mixed Grill                    │
└────────────────────────────────────────────────────────┘
```
- **Interactions**: Adjust = stepper modal with reason; "86 linked" one-tap 86s every menu item using the ingredient.
- **Motion**: LOW badge subtle pulse. **Empty**: setup wizard linking ingredients→items.

### C7. CRM Customer Profile

```
┌────────────────────────────────────────────────────────┐
│ ◉ +9627•••1234   "Ward"        Visits: 7   LTV: 84 JOD │
│ Favorites: Shawarma ×6 · Lemon mint ×5                 │
│ Dietary notes (AI-learned): no garlic                  │
│ ┌ Visit history: date · branch · total · rating ┐      │
│ Last feedback: ⭐⭐⭐⭐⭐ "الخدمة ممتازة"                 │
└────────────────────────────────────────────────────────┘
```
- **Privacy note on screen**: phone partially masked except for managers+; AI-learned notes editable/deletable. **Empty**: "Anonymous guest — no profile linked."

### C8. AI Knowledge Editor

```
┌────────────────────────────────────────────────────────┐
│ AI Knowledge   [+ Add entry]        Tone: [Friendly ▾] │
│ ▸ Opening hours          en+ar ✓    last edited 2d     │
│ ▸ Parking & directions   en only ⚠ missing ar          │
│ ▸ Allergen policy        en+ar ✓                       │
│ ┌─ Test the assistant ──────────────────────────────┐  │
│ │ you: do you have parking?                         │  │
│ │ AI:  Yes! Free parking behind the building…       │  │
└────────────────────────────────────────────────────────┘
```
- **Interactions**: entry → ar/en editor pair; built-in test chat sandbox (doesn't touch real carts); missing-translation warnings.
- **Motion**: test replies stream like the real chat. **Empty**: starter templates (hours/parking/allergy/wifi).

### C9. QR Manager

```
┌────────────────────────────────────────────────────────┐
│ QR & Tables   [+ Add table]  [⤓ Print all PDF]         │
│ T01  ▦QR  token …a8f2  [Preview][Regenerate][⤓ PDF]    │
│ T02  ▦QR  token …c91d  …                               │
│ Regenerate = old code stops working immediately ⚠      │
└────────────────────────────────────────────────────────┘
```
- **Interactions**: Regenerate has confirm dialog; Print-all builds branded A6 PDF sheet per table.
- **RTL**: PDF template has ar/en dual text baked in.

---

## D. PLATFORM (desktop)

### D1. Admin Restaurant List

```
┌──────────────────────────────────────────────────────────────┐
│ ▌Admin   Restaurants [🔍]            [+ Onboard restaurant]  │
│ NAME            BRANCHES  STATUS    ORDERS/30d  AI TOKENS  ⋯ │
│ Shams Al-Balad  3         ● active  9,812       4.1M       ⋯ │
│ Beit Sitti      1         ● active  2,104       0.9M       ⋯ │
│ Karam           2         ◉ suspnd  0           0          ⋯ │
└──────────────────────────────────────────────────────────────┘
```
- **Interactions**: row → D2; status filter chips; ⋯ menu: suspend, impersonate-readonly (audited), feature flags.
- **Empty**: "No restaurants yet — onboard your first." **Loading**: 8 row skeletons.

### D2. Restaurant Detail (admin)

```
┌──────────────────────────────────────────────────────────────┐
│ ← Shams Al-Balad        ● active     [Suspend][Flags][Notes] │
│ [Overview][Branches][Config][AI][Billing][Support]           │
│ ┌ KPIs ┐ ┌ live order stream (PII-redacted) ┐               │
│ ┌ Config: plan, languages, payment providers, voice ┐        │
└──────────────────────────────────────────────────────────────┘
```

### D3. AI Usage Monitor

```
┌──────────────────────────────────────────────────────────────┐
│ AI Monitor      p95 latency: 1.8s   error rate: 0.4%         │
│ ┌ tokens/day stacked area by restaurant ┐                    │
│ ┌ anomalies: Karam +480% tokens 06-08 ⚠ [investigate] ┐      │
│ Provider health: ◉ primary OK · ◉ fallback OK · breaker: off │
└──────────────────────────────────────────────────────────────┘
```
- **Interactions**: anomaly → drill into per-session token table; manual circuit-breaker toggle (Super Admin only, confirm dialog).

### D4. Billing Dashboard (platform)

```
┌──────────────────────────────────────────────────────────────┐
│ Billing — June 2026         [Run reconciliation] [Export ⤓]  │
│ RESTAURANT      CLOSED ORDERS  EVENTS  AMOUNT    STATUS      │
│ Shams Al-Balad  9,812          9,812   981.20 JOD ✓ matched  │
│ Beit Sitti      2,104          2,103   210.30 JOD ⚠ mismatch │
│ ┌ daily billing events area chart ┐   Invoices: 41 paid 2 due│
└──────────────────────────────────────────────────────────────┘
```
- **Interactions**: mismatch row → diff view (orders without events / orphan events) with repair actions (audited); invoice generation → Stripe.
- **Motion**: reconciliation run shows progress bar per restaurant.
- **Empty**: month with no data → "No billing events in this period."

---

## Global annotation rules (apply to every screen)

- **Skeletons**: always shape-matched to final layout (no spinners on page-level loads); shimmer gradient runs LTR in LTR, RTL in RTL.
- **Motion defaults**: `ease: [0.22, 1, 0.36, 1]`, page transitions 250ms fade+8px rise; respect `prefers-reduced-motion` (disable all non-essential animation, keep state changes instant).
- **Empty states**: illustration (line-art, orange accent) + one-line headline + single CTA, never two.
- **Toasts**: bottom on mobile, top-trailing on desktop; auto-dismiss 4s; destructive actions always offer Undo.
- **RTL**: only CSS logical properties (`padding-inline-start`…); icons with inherent direction (send, back, chevrons, progress) mirror; numerals, charts time-axes, and currency amounts do not mirror; mixed-direction text uses `dir="auto"` + unicode isolates.
