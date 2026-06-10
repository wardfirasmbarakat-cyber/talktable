# Firefly X TalkTable — 08 · UI Component Library & Design System

> The single source of truth for design tokens and every reusable component (lives in `packages/ui`). All components: TypeScript, TailwindCSS (token-driven), Framer Motion, dark+light themes, full RTL, WCAG 2.1 AA.

---

## 1. Design Tokens

Tokens are defined once as CSS variables on `:root` / `[data-theme="light"]` and mirrored into Tailwind config. Components never use raw hex.

### 1.1 Color — Dark (default)

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#04040A` | App background (Firefly black) |
| `--bg-raised` | `#0C0C16` | Cards, panels |
| `--bg-overlay` | `#13131F` | Modals, sheets, popovers |
| `--glass-bg` | `rgba(255,255,255,0.06)` | Glass panels |
| `--glass-border` | `rgba(255,255,255,0.08)` | 1px glass borders |
| `--text-primary` | `#F7F7FA` | Headings, body |
| `--text-secondary` | `#A1A1B5` | Captions, labels |
| `--text-tertiary` | `#62626E` | Placeholders, disabled |
| `--accent` | `#FF6B00` | Primary actions, brand |
| `--accent-hover` | `#FF7E1F` | Hover/active |
| `--accent-soft` | `rgba(255,107,0,0.12)` | Tinted backgrounds, focus halos |
| `--success` | `#2DD4A7` | Paid, ready, ok |
| `--warning` | `#FFB020` | SLA approaching, low stock |
| `--danger` | `#FF4D4F` | Errors, rejection, destructive |
| `--info` | `#4D9FFF` | Neutral info, seated tables |
| `--border` | `rgba(255,255,255,0.10)` | Dividers, input borders |
| `--focus-ring` | `#FF8A3D` | Visible focus (3:1 vs both themes) |

### 1.2 Color — Light

| Token | Value |
|---|---|
| `--bg-base` | `#FAFAFC` · `--bg-raised` `#FFFFFF` · `--bg-overlay` `#FFFFFF` |
| `--glass-bg` | `rgba(255,255,255,0.65)` · `--glass-border` `rgba(4,4,10,0.08)` |
| `--text-primary` | `#0A0A14` · `--text-secondary` `#54545F` · `--text-tertiary` `#9C9CA6` |
| `--accent` | `#E85D00` (darkened for 4.5:1 on white) · hover `#FF6B00` |
| `--success` `#0E9F76` · `--warning` `#B26B00` · `--danger` `#D92D20` · `--info` `#1570CC` |

Status colors always pair with an icon/label — never color alone (color-blind safety).

### 1.3 Typography

Fonts: **Inter** (Latin) + **IBM Plex Sans Arabic** (Arabic), loaded via `next/font`, `font-family` swaps per locale; numerals tabular in data contexts (`font-variant-numeric: tabular-nums`).

| Token | Size/Line | Weight | Use |
|---|---|---|---|
| `display` | 40/48 | 700 | Marketing, big numbers |
| `h1` | 28/36 | 700 | Page titles |
| `h2` | 22/30 | 600 | Section titles |
| `h3` | 18/26 | 600 | Card titles |
| `body` | 15/24 | 400 | Default |
| `body-strong` | 15/24 | 600 | Emphasis |
| `caption` | 13/18 | 400 | Meta, labels |
| `micro` | 11/14 | 500 | Badges, pills (uppercase Latin only — never uppercase Arabic) |
| `kds` | 20/28 | 600 | Kitchen display minimum size |

Arabic gets `+1px` size and `+10%` line-height at each step (script legibility).

### 1.4 Spacing, Radii, Shadows

- Spacing scale (px): `2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64` → `space-0.5 … space-16`.
- Radii: `--r-sm 8px` (inputs, chips) · `--r-md 12px` (buttons) · `--r-lg 16px` (cards) · `--r-xl 24px` (sheets, modals) · `--r-full 9999px` (pills, orb).
- Shadows (dark mode shadows are subtle + rely on borders):
  - `--shadow-1`: `0 1px 2px rgba(0,0,0,.4)`
  - `--shadow-2`: `0 4px 16px rgba(0,0,0,.35)`
  - `--shadow-3`: `0 12px 40px rgba(0,0,0,.45)`
  - `--glow-accent`: `0 0 24px rgba(255,107,0,.35)` (VoiceOrb, primary CTA hover)

### 1.5 Glassmorphism Recipe

```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
}
/* Fallback: @supports not (backdrop-filter: blur(1px)) → solid --bg-raised */
```
Rules: max 2 stacked glass layers; never glass-on-glass text below 4.5:1 — add a `rgba(4,4,10,.35)` scrim under text on imagery.

### 1.6 Motion Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 100ms | Hover, toggle thumbs |
| `--dur-fast` | 200ms | Buttons, chips, tooltips |
| `--dur-base` | 250ms | Page transitions, sheets in |
| `--dur-slow` | 400ms | Charts draw, steppers |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | Default enter |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | Movement |
| `spring.default` | `{ type:"spring", stiffness:380, damping:30 }` | Sheets, FABs, steppers |
| `spring.bouncy` | `{ stiffness:500, damping:22 }` | Badge pops, star fills |
| `stagger.list` | `staggerChildren: 0.04` | Lists, grids |

All motion gated behind `useReducedMotion()` — reduced mode keeps opacity fades ≤100ms only.

---

## 2. Component Inventory

Shared conventions: every component accepts `className`, forwards `ref`, supports `data-testid`; sizes `sm | md | lg`; controlled+uncontrolled where applicable. States to implement for ALL interactive components: default, hover, active/pressed, focus-visible, disabled, loading (where async), error (form components).

### Button
```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "glass";
  size?: "sm" | "md" | "lg";
  loading?: boolean;          // spinner replaces label, width preserved
  iconStart?: ReactNode; iconEnd?: ReactNode; // auto-swap in RTL
  fullWidth?: boolean;
}
```
Variants: primary (orange, white text), secondary (raised bg + border), ghost (text only), danger (red), glass. Motion: `whileTap={{scale:0.97}}`. A11y: native `<button>`, `aria-busy` when loading, min target 44×44, contrast ≥4.5:1 label.

### Input
```ts
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string; hint?: string; error?: string;
  iconStart?: ReactNode; trailingAction?: ReactNode; // e.g. password eye
  dir?: "auto" | "ltr" | "rtl"; // default "auto" for mixed content
}
```
States: default/focus (accent ring 2px)/error (danger border + `aria-describedby` message)/disabled. A11y: visible `<label>` always (no placeholder-as-label), `aria-invalid`.

### Select
```ts
interface SelectProps<T> {
  label: string; options: { value: T; label: string; icon?: ReactNode; disabled?: boolean }[];
  value: T; onChange: (v: T) => void;
  searchable?: boolean; error?: string; placeholder?: string;
}
```
Custom listbox (Radix-style): `role="combobox"` + `listbox`, full keyboard (↑↓ Home End type-ahead Esc), popover flips near viewport edge. RTL: chevron stays trailing; popover aligns to logical start.

### Modal
```ts
interface ModalProps {
  open: boolean; onClose: () => void;
  title: string; description?: string;
  size?: "sm" | "md" | "lg" | "full";
  footer?: ReactNode; dismissable?: boolean; // false = no overlay/Esc close
}
```
Motion: overlay fade + panel `scale 0.96→1` (`--dur-base`). A11y: focus trap, return focus on close, `role="dialog" aria-modal`, labelled by title, Esc closes (unless `dismissable=false`).

### BottomSheet
```ts
interface BottomSheetProps {
  open: boolean; onClose: () => void;
  snapPoints?: number[];      // e.g. [0.5, 0.92]
  children: ReactNode; grabHandle?: boolean; // default true
}
```
Drag-to-dismiss (velocity-aware spring), background scale-down 0.98 on open (iOS feel). Desktop ≥768px: renders as Modal automatically. A11y: same dialog semantics; drag handle has button alternative for keyboard.

### Toast
```ts
type ToastVariant = "success" | "error" | "info" | "warning";
toast({ variant, title, description?, action?: { label, onClick }, duration? }) // default 4000ms
```
Queue max 3, stack with layout animation. A11y: `role="status"` (errors: `role="alert"`), pauses timer on hover/focus, actions keyboard-reachable.

### Badge
```ts
interface BadgeProps { variant?: "neutral"|"accent"|"success"|"warning"|"danger"|"info";
  size?: "sm"|"md"; dot?: boolean; children: ReactNode }
```

### StatusPill
```ts
interface StatusPillProps {
  status: "placed"|"accepted"|"preparing"|"ready"|"served"|"paid"|"closed"|"rejected"
        | "open"|"acknowledged"|"resolved" | "active"|"suspended";
  pulse?: boolean; // animated dot for live states
}
```
Maps status→color+icon+localized label from a single registry (consistency across all dashboards). Never color-only.

### KPICard
```ts
interface KPICardProps {
  label: string; value: string | number;
  delta?: { value: number; direction: "up"|"down"; positiveIsGood?: boolean };
  icon?: ReactNode; loading?: boolean; onClick?: () => void; sparkline?: number[];
}
```
Motion: value count-up on mount (skipped in reduced motion). Loading: shape-matched skeleton.

### ChartCard
```ts
interface ChartCardProps {
  title: string; type: "line" | "bar" | "donut";
  data: ChartSeries[]; range?: ReactNode; // header-right slot
  loading?: boolean; empty?: { message: string };
  formatValue?: (n: number) => string; // currency etc.
}
```
Draw-in animation (`pathLength`/grow, `--dur-slow`). A11y: `role="img"` + generated `aria-label` summary + hidden data table for screen readers. RTL: time axes stay LTR; legends/labels localize.

### DataTable
```ts
interface DataTableProps<Row> {
  columns: { key: string; header: string; sortable?: boolean; align?: "start"|"end";
             render?: (row: Row) => ReactNode; width?: string }[];
  rows: Row[]; rowKey: (r: Row) => string;
  onRowClick?: (r: Row) => void; loading?: boolean; emptyState?: ReactNode;
  pagination?: { page: number; pageSize: number; total: number; onChange: (p:number)=>void };
  stickyFirstColumn?: boolean;
}
```
A11y: real `<table>`, `aria-sort`, sortable headers are buttons; row click also exposed via in-row link. RTL: `align:"end"` keeps numeric columns consistent; sticky column flips side.

### TableMapTile
```ts
interface TableMapTileProps {
  table: { id: string; label: string };
  state: "empty"|"seated"|"ordering"|"request"|"bill"|"sla_breach"|"needs_reset";
  requestCount?: number; elapsed?: number; onPress: () => void;
}
```
Motion: `request`/`sla_breach` pulse loop (disabled in reduced motion → static halo). A11y: button with full label ("Table 12 — open request, 2 minutes").

### OrderTicket
```ts
interface OrderTicketProps {
  order: { id: string; number: number; tableLabel: string; placedAt: Date;
           items: { qty: number; name: string; modifiers: string[]; allergyNote?: string; done?: boolean }[];
           status: OrderStatus; eta?: number };
  onAccept?: (etaMin?: number) => void; onReject?: () => void;
  onStart?: () => void; onDone?: () => void; onItemToggle?: (i: number) => void;
  compact?: boolean; // waiter serve-queue variant
}
```
Timer color thresholds via tokens (`warning` >10m, `danger` >15m). KDS type scale (`kds`). Motion: column moves via `layout`; entry slide-in.

### ChatBubble
```ts
interface ChatBubbleProps {
  role: "user" | "assistant" | "system";
  children: ReactNode; streaming?: boolean;
  attachments?: ReactNode;   // inline cart chips, item cards
  timestamp?: Date; dir?: "auto";
}
```
Assistant glass / user accent-soft. Streaming caret animation. A11y: thread is `role="log" aria-live="polite"`; per-bubble `dir="auto"`.

### VoiceOrb
```ts
interface VoiceOrbProps {
  state: "idle" | "listening" | "thinking" | "speaking" | "error";
  amplitude?: number;     // 0–1, drives ring scale while listening
  onPress: () => void;    // toggle/submit
  size?: number;          // px, default 160
}
```
Motion spec: listening = 3 concentric rings, scale `1 + amplitude*0.25`, opacity falloff, accent glow; thinking = conic-gradient rotation 1.2s loop; speaking = 5-bar waveform; error = single red shake. Reduced motion: static states with text labels. A11y: `aria-pressed`, state announced via visually-hidden live region ("Listening", "Thinking…").

### MenuItemCard
```ts
interface MenuItemCardProps {
  item: { id: string; name: string; price: number; currency: string;
          imageUrl?: string; badges?: ("vegan"|"spicy"|"popular"|"new")[];
          available: boolean };
  onPress: (id: string) => void; layout?: "grid" | "list";
}
```
Unavailable: desaturated, `aria-disabled`, "Sold out" pill, not focus-skipped (announced). Image: blur-up placeholder.

### CartLine
```ts
interface CartLineProps {
  line: { id: string; name: string; qty: number; unitPrice: number;
          modifiersSummary?: string; note?: string };
  onQtyChange: (qty: number) => void; onRemove: () => void;
  swipeToDelete?: boolean; // mirrors direction in RTL
}
```

### QuantityStepper
```ts
interface QuantityStepperProps {
  value: number; min?: number; max?: number;
  onChange: (v: number) => void; size?: "sm"|"md";
}
```
A11y: group `role="spinbutton"` semantics (`aria-valuenow/min/max`), buttons labelled "Increase/Decrease quantity"; value pop animation. RTL: visual order mirrors, +/- semantics unchanged.

### RatingStars
```ts
interface RatingStarsProps {
  value: number; onChange?: (v: 1|2|3|4|5) => void; // read-only if absent
  size?: "sm"|"md"|"lg";
}
```
A11y: radiogroup of 5 radios ("3 of 5 stars"); keyboard arrows; fill animation `spring.bouncy` sequential.

### Sidebar
```ts
interface SidebarProps {
  items: { icon: ReactNode; label: string; href: string; badge?: number }[];
  collapsed?: boolean; onCollapseToggle?: () => void;
  footer?: ReactNode; // theme toggle, user menu
}
```
Active indicator slides between items (`layoutId`). Mobile: becomes bottom tab bar or drawer per app shell. RTL: docks to right; collapse chevron mirrors. A11y: `<nav aria-label>`, `aria-current="page"`.

### TopBar
```ts
interface TopBarProps {
  title?: ReactNode; back?: { href?: string; onClick?: () => void };
  actions?: ReactNode; transparent?: boolean; // glass-on-scroll
}
```
Glass appears after 8px scroll (background opacity tween). Back chevron mirrors in RTL.

### NotificationBell
```ts
interface NotificationBellProps {
  count: number; items: NotificationItem[];
  onOpen: () => void; onItemClick: (id: string) => void; onMarkAllRead: () => void;
}
```
Badge pop on increment + bell ring rotation (±12°, 0.5s). Popover list with read/unread, relative times (localized). A11y: button "Notifications, 3 unread"; popover is `role="menu"`-free plain list with headings; live region announces new arrivals on staff screens.

### LanguageSwitch
```ts
interface LanguageSwitchProps { value: "ar" | "en"; onChange: (l: "ar"|"en") => void; compact?: boolean }
```
Each option rendered in its own script ("العربية", "English"). Switching flips `dir` instantly without reload. A11y: `lang` attribute per option.

### ThemeToggle
```ts
interface ThemeToggleProps { value: "dark"|"light"|"system"; onChange: (t) => void }
```
Sun/moon morph animation; persists to localStorage + cookie (SSR-safe, no flash via inline script).

### EmptyState
```ts
interface EmptyStateProps {
  illustration?: ReactNode; title: string; description?: string;
  action?: { label: string; onClick: () => void };
}
```
One action max. Fade+rise entrance.

### Skeleton
```ts
interface SkeletonProps { variant?: "text"|"rect"|"circle"; width?: string; height?: string; lines?: number }
```
Shimmer direction follows reading direction; `aria-hidden`, parent region uses `aria-busy="true"`.

---

## 3. Accessibility Requirements (global)

- WCAG 2.1 AA: text contrast ≥4.5:1 (≥3:1 large), UI/graphics ≥3:1; verified per theme in CI (axe + custom token tests).
- Keyboard: every interaction reachable; visible `:focus-visible` ring (`--focus-ring`, 2px offset 2px); no positive tabindex; skip-to-content link in shells.
- Touch targets ≥44×44 (KDS ≥56×56).
- Live regions: order status, waiter requests, chat replies, toasts.
- Forms: label always visible, errors text+icon, `aria-invalid`, error summary focus on submit failure.
- `prefers-reduced-motion` honored library-wide via a single `MotionProvider`.
- Screen-reader localization: all `aria-label`s come from i18n messages, never hardcoded English.

## 4. RTL Adaptation Rules

1. CSS logical properties only (`margin-inline-start`, `inset-inline-end`, `text-align: start`); lint rule bans physical left/right in `packages/ui`.
2. `dir` set on `<html>` from locale; components must not read locale — they read computed direction.
3. Mirror: directional icons (back, send, chevrons, progress arrows), swipe gestures, drag-reorder handles, stepper visual order, sidebar dock side, shimmer direction, carousel direction.
4. Do NOT mirror: clocks, media controls (play), phone numbers, numerals, currency amounts, chart time axes, logos, checkmarks, star rating value semantics.
5. Mixed text: `dir="auto"` + `unicode-bidi: isolate` on user-generated strings (names, notes, chat).
6. Numbers: Western digits default; per-restaurant option for Arabic-Indic digits applies via `Intl.NumberFormat('ar-JO-u-nu-arab')` only in customer surfaces.
7. Fonts swap per script automatically (fallback stacks include both); test every component story in `ar`+RTL in Storybook (`dir` toolbar) and in visual regression CI.
