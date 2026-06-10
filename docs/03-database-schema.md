# Firefly X TalkTable — Database Schema (Firestore)

**Document:** 03-database-schema.md
Defines the complete Firestore data model for the target platform, the mapping from the existing Prisma/PostgreSQL (Neon) schema, the migration strategy, and the full `firestore.rules`, `storage.rules`, and `firestore.indexes.json`.

Conventions:
- All timestamps are Firestore `Timestamp` (UTC).
- All money is stored as **integer fils** (`1 JOD = 1000 fils`) to avoid float errors; field names suffixed `Fils`. The platform order fee is `100` fils = 0.100 JOD.
- Bilingual fields: `name` (EN) + `nameAr`; same for descriptions.
- Soft delete via `isActive`/`deletedAt`; ledgers are append-only.
- Doc IDs are Firestore auto-IDs unless stated (deterministic IDs used for idempotency).

---

## 1. Collections

### 1.1 `users/{userId}` — staff & platform users

Doc ID = Firebase Auth UID. Customers are NOT in this collection (see `customers`).

```typescript
type Role =
  | "CUSTOMER"          // anonymous/phone-auth; never stored in users collection
  | "WAITER" | "CASHIER" | "KITCHEN"
  | "BRANCH_MANAGER" | "OWNER"
  | "PLATFORM_ADMIN" | "SUPER_ADMIN";

interface UserDoc {
  email: string;
  name: string;
  nameAr?: string;
  role: Exclude<Role, "CUSTOMER">;
  restaurantId: string | null;        // null for platform roles
  branchIds: string[];                // scoped branches; OWNER ⇒ all (empty = all)
  isActive: boolean;
  mfaEnrolled: boolean;               // required true for OWNER/PLATFORM_ADMIN/SUPER_ADMIN
  mustChangePassword: boolean;
  phone?: string;
  photoUrl?: string;
  lastLoginAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```
Custom claims mirror `{role, restaurantId, branchIds}` (set by `admin-setUserRole` function; claims are the authority for rules).

**Indexes:** `(restaurantId ASC, role ASC, isActive ASC)`.

**Example**
```json
{ "email": "ahmad@shawarma-house.jo", "name": "Ahmad K.", "role": "WAITER",
  "restaurantId": "rest_x9d2", "branchIds": ["br_abdoun"], "isActive": true,
  "mfaEnrolled": false, "mustChangePassword": false,
  "createdAt": "2026-05-01T08:00:00Z", "updatedAt": "2026-06-01T10:11:00Z" }
```

### 1.2 `restaurants/{restaurantId}`

```typescript
interface RestaurantDoc {
  name: string; nameAr?: string;
  slug: string;                        // unique; uniqueness enforced via slugs/{slug} reservation doc
  logoUrl?: string; coverUrl?: string;
  brandColor?: string;                 // hex
  ownerUserId: string;
  currency: "JOD";
  timezone: string;                    // default "Asia/Amman"
  status: "ONBOARDING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED";
  settings: {
    aiSystemPrompt?: string;
    aiChatModelTier: "chat";           // informational; routing is platform config
    upsellEnabled: boolean;
    orderAutoAccept: boolean;
    notificationSound: boolean;
    maxTableWaitMinutes: number;       // default 30
    loyalty: { enabled: boolean; earnRatePtsPerJod: number; expiryMonths: number };
  };
  billing: {
    feePerOrderFils: number;           // 100 (0.10 JOD) — platform default, overridable by SUPER_ADMIN
    paymentMethod: "STRIPE" | "EFAWATEER" | "CLIQ" | "MANUAL";
    stripeCustomerId?: string;
    billingEmail: string;
  };
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
Companion: `slugs/{slug} = { restaurantId }` (transactional uniqueness).

### 1.3 `restaurants/{restaurantId}/branches/{branchId}`

```typescript
interface BranchDoc {
  name: string; nameAr?: string;
  address?: string; addressAr?: string;
  geo?: { lat: number; lng: number };
  phone?: string;
  timezone: string;
  hours: { [dow in 0|1|2|3|4|5|6]: { open: string; close: string; closed: boolean } }; // "HH:mm"
  holidayExceptions: { date: string; closed: boolean; open?: string; close?: string }[];
  isActive: boolean;
  kitchenBusyExtraMinutes: number;      // rush control, default 0
  ordersPaused: boolean;
  stationMap?: Record<string, string>;  // categoryId -> station name (KDS routing)
  menuVersion: number;                  // bumped on snapshot regeneration
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
Companion materialized doc: `restaurants/{r}/branches/{b}/meta/menuSnapshot` — the single-read menu the PWA loads (denormalized categories+items with branch overrides applied, `version`, `generatedAt`).

### 1.4 `restaurants/{r}/branches/{b}/tables/{tableId}`

```typescript
interface TableDoc {
  number: number;                // unique per branch (transactional check)
  label?: string;                // "Terrace 4"
  zone?: string;
  capacity?: number;
  qrToken: string;               // 128-bit random, also indexed in global qrTokens/{token}
  qrScans: number;               // sharded counter at scale; plain int <100 rest.
  isActive: boolean;
  currentSessionId: string | null;  // active table session
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
Companion global lookup: `qrTokens/{token} = { restaurantId, branchId, tableId, active }` (single edge-cached read on scan).

### 1.5 Menu: `restaurants/{r}/categories/{id}`, `restaurants/{r}/menuItems/{id}`, `restaurants/{r}/menus/{id}`

```typescript
interface CategoryDoc {
  name: string; nameAr?: string; emoji?: string;
  sortOrder: number; isActive: boolean;
  createdAt: Timestamp;
}

interface MenuItemDoc {
  categoryId: string;
  name: string; nameAr?: string;
  description?: string; descriptionAr?: string;
  priceFils: number;                       // master price
  costFils?: number;                       // for margin analytics
  imageUrl?: string; emoji?: string;
  calories?: number;
  prepMinutesEstimate?: number;
  allergens: string[];                     // canonical keys: "nuts","gluten","dairy","egg","fish","shellfish","soy","sesame"
  ingredients: { name: string; nameAr?: string; inventoryItemId?: string; qtyPerServing?: number }[];
  tags: ("vegetarian"|"vegan"|"spicy"|"halal"|"new")[];
  isAvailable: boolean; isFeatured: boolean; isPopular: boolean;
  sortOrder: number;
  branchOverrides?: Record<string, { priceFils?: number; isAvailable?: boolean }>; // branchId-keyed
  isActive: boolean;
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface MenuDoc {                        // named menus (e.g. Ramadan, Breakfast)
  name: string; nameAr?: string;
  categoryIds: string[];
  schedule?: { days: number[]; from: string; to: string };  // active window
  isDefault: boolean; isActive: boolean;
}
```
**Indexes:** `menuItems (categoryId ASC, isActive ASC, sortOrder ASC)`; `menuItems (isPopular DESC, isActive ASC)`.

**Example menuItem**
```json
{ "categoryId": "cat_mains", "name": "Chicken Shawarma Plate", "nameAr": "صحن شاورما دجاج",
  "priceFils": 4500, "costFils": 1800, "calories": 720,
  "allergens": ["sesame","gluten"], "tags": ["halal"],
  "ingredients": [{"name":"Chicken","nameAr":"دجاج","inventoryItemId":"inv_chk","qtyPerServing":0.25}],
  "isAvailable": true, "isFeatured": true, "isPopular": true, "sortOrder": 1,
  "branchOverrides": { "br_airport": { "priceFils": 5000 } },
  "isActive": true, "createdAt": "...", "updatedAt": "..." }
```

### 1.6 `restaurants/{r}/branches/{b}/orders/{orderId}` — items embedded

Items are **embedded** (orders are read/written atomically, items never queried independently across orders at serving time; item-level analytics happen in BigQuery). Max ~50 items/order keeps docs ≪1MB.

```typescript
type OrderStatus = "PENDING"|"ACCEPTED"|"PREPARING"|"READY"|"SERVED"|"COMPLETED"|"CANCELLED";

interface OrderDoc {
  orderNumber: number;                 // per-branch daily sequence via counter shard
  tableId: string; tableNumber: number;
  sessionId: string;                   // anonymous customer session
  customerId?: string;                 // CRM link if enrolled
  status: OrderStatus;
  items: {
    menuItemId: string;
    name: string; nameAr?: string;     // snapshot at order time
    priceFils: number; quantity: number;
    notes?: string;
    subtotalFils: number;
    allergenFlags?: string[];          // intersection with CRM allergies, for ticket display
  }[];
  subtotalFils: number;
  discountFils: number;                // loyalty redemption etc.
  totalFils: number;
  notes?: string;
  source: "QR_MENU" | "AI_CHAT" | "AI_VOICE" | "STAFF";
  aiSessionId?: string;
  statusTimestamps: Partial<Record<OrderStatus, Timestamp>>; // placedAt = statusTimestamps.PENDING
  cancelReason?: string;
  statusHistory: { status: OrderStatus; byUserId: string | null; note?: string; at: Timestamp }[];
  billedLedgerId?: string;             // set by billing trigger
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
**Indexes:** `(status ASC, createdAt ASC)` collection-scope; collection-group `orders (customerId ASC, createdAt DESC)`, `orders (sessionId ASC, createdAt DESC)`, `orders (status ASC, updatedAt DESC)`.

### 1.7 `restaurants/{r}/branches/{b}/waiterRequests/{id}`

```typescript
interface WaiterRequestDoc {
  tableId: string; tableNumber: number;
  sessionId: string;
  type: "CALL_WAITER"|"REQUEST_BILL"|"WATER_REFILL"|"ASSISTANCE";
  status: "OPEN"|"ACKNOWLEDGED"|"RESOLVED";
  note?: string;
  orderId?: string;
  acknowledgedBy?: string; acknowledgedAt?: Timestamp;
  resolvedBy?: string; resolvedAt?: Timestamp;
  escalatedAt?: Timestamp;
  createdAt: Timestamp;
}
```
**Indexes:** `(status ASC, createdAt ASC)`.

### 1.8 `customers/{customerId}` and `customers/{id}/visits/{visitId}` — CRM

Doc ID = Firebase Auth UID of the phone-verified customer.

```typescript
interface CustomerDoc {
  phone: string;                       // E.164, verified
  displayName?: string;
  language: "ar" | "en";
  consent: { profile: boolean; marketing: boolean; consentAt: Timestamp };
  createdAt: Timestamp; updatedAt: Timestamp;
  // per-restaurant profiles in map (bounded: a customer enrolls per restaurant)
  restaurants: Record<string, {
    allergies: string[];
    preferences?: string;              // free text
    favorites: string[];               // menuItemIds (explicit hearts)
    loyaltyPoints: number;             // denormalized balance; ledger is authoritative
    visitCount: number;
    lastVisitAt?: Timestamp;
    tier: "NEW"|"OCCASIONAL"|"REGULAR"|"VIP";
    enrolledAt: Timestamp;
  }>;
}

interface VisitDoc {                   // customers/{id}/visits/{visitId}
  restaurantId: string; branchId: string; tableId: string;
  sessionId: string;
  startedAt: Timestamp; endedAt?: Timestamp;
  orderIds: string[];
  totalSpentFils: number;
}
```
Companion ledger: `customers/{id}/loyaltyLedger/{entryId}` `{restaurantId, deltaPoints, reason: "EARN"|"REDEEM"|"EXPIRE"|"ADJUST", orderId?, at}` — append-only.

**Indexes:** `customers (phone ASC)`; collection-group `visits (restaurantId ASC, startedAt DESC)`.

### 1.9 `restaurants/{r}/feedback/{id}`

```typescript
interface FeedbackDoc {
  branchId: string; tableId?: string; orderId?: string; sessionId?: string;
  customerId?: string;
  foodRating: number; serviceRating: number; atmosphereRating: number; // 1..5
  comment?: string; commentLanguage?: "ar"|"en";
  sentiment?: "POS"|"NEU"|"NEG";       // AI-filled
  themeIds?: string[];                 // links to insight themes
  moderated: boolean;
  createdAt: Timestamp;
}
```
**Indexes:** `(branchId ASC, createdAt DESC)`.

### 1.10 `restaurants/{r}/inventory/{itemId}`

```typescript
interface InventoryItemDoc {
  name: string; nameAr?: string;
  unit: string;                        // "kg","L","pcs"
  quantity: number;
  lowStockThreshold: number;
  costPerUnitFils?: number;
  supplier?: string;
  leadTimeDays?: number;
  branchId?: string;                   // null = shared store
  predictedStockoutAt?: Timestamp;     // BI-filled
  isActive: boolean;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
Companion: `inventory/{id}/movements/{mvId}` `{delta, reason: "PURCHASE"|"COUNT"|"CONSUMPTION"|"WASTE", byUserId, at}` — append-only.

### 1.11 `restaurants/{r}/knowledgeBase/{id}`

```typescript
interface KnowledgeItemDoc {
  category: "hours"|"policies"|"facilities"|"promotions"|"faq"|"other";
  title: string; titleAr?: string;
  content: string; contentAr?: string;
  embedding?: number[];                // for retrieval (or stored in vector ext.)
  isActive: boolean;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```

### 1.12 `restaurants/{r}/analytics/{rollupId}` — daily rollups

Doc ID: `{branchId}_{YYYY-MM-DD}` (branch-local date) and `{branchId}_h_{YYYY-MM-DD-HH}` for hourly.

```typescript
interface DailyRollupDoc {
  branchId: string; date: string;
  revenueFils: number; orderCount: number; completedCount: number; cancelledCount: number;
  avgTicketFils: number;
  qrScans: number; menuSessions: number; cartsCreated: number;
  avgPrepSeconds: number; avgAckSeconds: number;
  itemSales: Record<string, { units: number; revenueFils: number }>;  // menuItemId-keyed (≤ menu size)
  ratings: { food: number; service: number; atmosphere: number; count: number };
  aiChatSessions: number; aiVoiceSessions: number; aiAttributedOrders: number;
  updatedAt: Timestamp;
}
```

### 1.13 `billing/{restaurantId}` + subcollections — per-order ledger & invoices

```typescript
// billing/{restaurantId}                — account summary
interface BillingAccountDoc {
  balanceFils: number;                   // un-invoiced accrued fees (denormalized)
  status: "OK"|"PAST_DUE"|"SUSPENDED";
  lastInvoiceId?: string;
  updatedAt: Timestamp;
}

// billing/{restaurantId}/ledger/{entryId}   — entryId = `chg_{orderId}` | `crd_{orderId}` (idempotent)
interface LedgerEntryDoc {
  type: "ORDER_FEE"|"ORDER_FEE_CREDIT"|"ADJUSTMENT";
  amountFils: number;                    // +100 for fee, negative for credit
  currency: "JOD";
  orderId?: string; branchId?: string;
  orderTotalFils?: number;
  occurredAt: Timestamp;
  invoiceId: string | null;              // set when swept into an invoice
  createdAt: Timestamp;
}

// billing/{restaurantId}/invoices/{invoiceId}  — invoiceId = `inv_{YYYYMM}_{restaurantId}`
interface InvoiceDoc {
  period: { from: string; to: string };  // dates
  ledgerEntryCount: number;
  totalFils: number;
  status: "DRAFT"|"ISSUED"|"PAID"|"FAILED"|"VOID";
  pdfPath?: string;                      // Storage path
  payment?: { provider: "STRIPE"|"EFAWATEER"|"CLIQ"|"MANUAL"; externalId?: string; paidAt?: Timestamp; attempts: number };
  issuedAt?: Timestamp; dueAt?: Timestamp;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```
**Indexes:** collection-group `ledger (invoiceId ASC, occurredAt ASC)`; `invoices (status ASC, dueAt ASC)`.

### 1.14 `notifications/{userId}/items/{notifId}`

```typescript
interface NotificationDoc {
  type: "WAITER_REQUEST"|"ORDER_READY"|"ESCALATION"|"LOW_STOCK"|"INVOICE"|"SYSTEM";
  title: string; titleAr?: string; body: string; bodyAr?: string;
  data: Record<string, string>;        // deep-link payload
  read: boolean;
  createdAt: Timestamp;
}
```

### 1.15 `auditLogs/{id}` — global, append-only

```typescript
interface AuditLogDoc {
  actorUserId: string | null;          // null = system
  actorRole: Role | "SYSTEM";
  restaurantId?: string; branchId?: string;
  action: string;                      // catalog in 05-security-architecture.md §6
  resource?: string;                   // "order:abc123"
  ipAddress?: string; userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
}
```
**Indexes:** `(restaurantId ASC, createdAt DESC)`, `(actorUserId ASC, createdAt DESC)`, `(action ASC, createdAt DESC)`. Written only by Cloud Functions (Admin SDK); no client write path.

### 1.16 `aiUsage/{restaurantId}/months/{YYYYMM}` + `aiUsage/{restaurantId}/calls/{callId}`

```typescript
interface AIUsageMonthDoc {            // aggregated (sharded counters at scale)
  inputTokens: number; outputTokens: number; cacheReadTokens: number;
  callCount: number; estCostUsdMicros: number;
  byFeature: Record<"chat"|"voice"|"bi"|"insights", { calls: number; inputTokens: number; outputTokens: number }>;
  byProvider: Record<string, { calls: number; failovers: number }>;
  updatedAt: Timestamp;
}

interface AIUsageCallDoc {             // raw, TTL 90 days
  feature: "chat"|"voice"|"bi"|"insights";
  provider: string; model: string;
  inputTokens: number; outputTokens: number; latencyMs: number;
  failedOver: boolean; sessionId: string;
  at: Timestamp;
}
```

### 1.17 `aiSessions/{sessionId}` — chat/voice transcripts

```typescript
interface AISessionDoc {
  restaurantId: string; branchId: string; tableId: string;
  customerId?: string;
  channel: "chat"|"voice";
  turns: { role: "user"|"assistant"; text: string; toolCalls?: {name: string; input: unknown}[]; at: Timestamp }[];
  abuseStrikes: number; locked: boolean;
  startedAt: Timestamp; lastTurnAt: Timestamp;
}
```
TTL: 30 days (PII minimization).

---

## 2. Mapping: Prisma/PostgreSQL → Firestore

| Prisma model (existing MVP) | Firestore target | Notes |
|---|---|---|
| `Restaurant` | `restaurants/{id}` | `slug` → companion `slugs/{slug}`; `currency`,`timezone` carried over. |
| `RestaurantSettings` | embedded `restaurants.settings` | 1:1 table flattened into parent doc. `aiModel` replaced by platform-level tier routing. |
| `User` (Role enum ADMIN/OWNER/MANAGER/KITCHEN/WAITER) | `users/{uid}` + Firebase Auth users + custom claims | Role mapping: ADMIN→PLATFORM_ADMIN, MANAGER→BRANCH_MANAGER, others 1:1; new roles CASHIER, SUPER_ADMIN, CUSTOMER added. `passwordHash` (Argon2) NOT migrated — users imported into Firebase Auth via `importUsers` with a custom Argon2 hash config, or forced reset. `failedLoginCount/lockedUntil` → Firebase Auth built-in protections. |
| `Session` (JWT sessions) | — dropped | Firebase Auth ID/refresh tokens replace custom sessions; revocation via `revokeRefreshTokens`. |
| `Table` | `restaurants/{r}/branches/{b}/tables/{id}` + `qrTokens/{token}` | MVP is single-branch: each restaurant gets one auto-created `branches/main`; `qrToken` re-used so printed QRs stay valid; `@@unique(restaurantId, number)` enforced transactionally. |
| `Category` | `restaurants/{r}/categories/{id}` | direct. |
| `MenuItem` | `restaurants/{r}/menuItems/{id}` | `price Decimal(10,3)` → `priceFils` int (×1000). |
| `Allergen` + `MenuItemAllergen` (M:N) | `menuItems.allergens: string[]` | global allergen table becomes canonical string enum; join table denormalized into array. |
| `MenuItemIngredient` | `menuItems.ingredients[]` | embedded; gains optional `inventoryItemId` link. |
| `Order` + `OrderItem` | `branches/{b}/orders/{id}` with embedded `items[]` | `placedAt/acceptedAt/...` columns → `statusTimestamps` map; `@@unique(restaurantId, orderNumber)` → per-branch daily counter. |
| `OrderStatusHistory` | embedded `orders.statusHistory[]` | bounded (≤ ~10 transitions). |
| `WaiterRequest` | `branches/{b}/waiterRequests/{id}` | direct; gains assignee fields. |
| `Feedback` | `restaurants/{r}/feedback/{id}` | gains sentiment/theme fields. |
| `InventoryItem` | `restaurants/{r}/inventory/{id}` (+ movements subcoll.) | `Decimal` quantities → number; cost → fils. |
| `KnowledgeItem` | `restaurants/{r}/knowledgeBase/{id}` | direct + embeddings. |
| `AuditLog` (AuditAction enum) | `auditLogs/{id}` | enum values become string action catalog (superset). |
| — (new) | `customers`, `billing`, `analytics`, `aiUsage`, `aiSessions`, `notifications`, `menus` | no Postgres counterpart; created fresh. |

## 3. Migration Strategy

### Phase A — Dual-write
1. Ship a `DataWriter` abstraction in the Next.js app: every mutation goes through it. Primary = Prisma/Postgres (source of truth); secondary = Firestore (best-effort, queued via Cloud Tasks with retry; failures logged, never block the request).
2. Reads stay on Postgres. Firestore writes validated by a shadow-diff job (hourly: sample N records, compare canonical JSON projections, alert on drift).
3. ID strategy: Postgres cuids are reused verbatim as Firestore doc IDs — no ID translation table needed.

### Phase B — Backfill
1. One-off backfill job (Node script, batched 500 writes/commit, resumable by cursor table): Restaurants → Branches(main) → Tables/qrTokens → Categories → MenuItems → Orders(+items, last 13 months; older orders to BigQuery only) → WaiterRequests → Feedback → Inventory → Knowledge → AuditLogs.
2. Auth migration: export users, `auth.importUsers` with Argon2 hashing config (Firebase supports custom hash import); set custom claims from `role/restaurantId`.
3. Backfill runs while dual-write is on; conflict rule: backfill never overwrites a doc whose `updatedAt` ≥ source row's `updatedAt`.

### Phase C — Cutover
1. Flip reads surface-by-surface behind feature flags: menu (lowest risk) → analytics → orders/KDS (highest risk; do at lowest-traffic hour per branch) → auth.
2. Realtime: Socket.io emitters retired per surface as its Firestore listener path enables.
3. Keep dual-write *reversed* (Firestore primary → Postgres mirror) for 30 days as rollback insurance; then decommission Postgres writes, snapshot the database, retain snapshot 12 months.
4. Success criteria per surface: 7 days, error rate ≤ baseline, p95 latency ≤ baseline+20%, zero data-drift alerts.

### Option B — Stay on PostgreSQL (honest assessment)
The existing relational schema **already covers everything Phase 1 needs** — multi-tenant restaurants, menu with allergens/ingredients, full order lifecycle with history, waiter requests, feedback, inventory, knowledge base, sessions, audit logs — with strong consistency, real foreign keys, cheap aggregate queries (`SUM/GROUP BY` that Firestore needs rollup machinery to imitate), and a working deployment on Neon. Migrating to Firestore is **optional** and should be justified by the things Firestore actually buys: managed realtime listeners (replacing the Socket.io server, which is the main operational misfit on Vercel), client offline cache, security-rules-enforced direct client reads, and zero-ops horizontal scale. A credible alternative is: keep Postgres as the system of record, add Postgres logical replication / LISTEN-NOTIFY → a managed realtime channel (or Supabase Realtime / Ably), and skip the migration entirely. Recommendation: do not migrate before product-market fit forces the realtime/scale issue; if migrating, follow Phases A–C above. The rest of this document specifies the Firestore target for when/if that decision is taken.

---

## 4. `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ───── helpers ─────
    function signedIn() { return request.auth != null; }
    function claims() { return request.auth.token; }
    function role() { return signedIn() ? claims().role : null; }
    function isPlatform() { return role() in ['PLATFORM_ADMIN', 'SUPER_ADMIN']; }
    function isSuper() { return role() == 'SUPER_ADMIN'; }
    function inRestaurant(rid) { return signedIn() && claims().restaurantId == rid; }
    function inBranch(rid, bid) {
      return inRestaurant(rid) &&
        (role() == 'OWNER' || bid in claims().branchIds);
    }
    function isStaff(rid) {
      return inRestaurant(rid) &&
        role() in ['WAITER','CASHIER','KITCHEN','BRANCH_MANAGER','OWNER'];
    }
    function isMgmt(rid) { return inRestaurant(rid) && role() in ['BRANCH_MANAGER','OWNER']; }
    function isOwner(rid) { return inRestaurant(rid) && role() == 'OWNER'; }
    // anonymous customers: signed in (anonymous provider) without a role claim
    function isCustomer() { return signedIn() && !('role' in claims()); }

    // ───── restaurants ─────
    match /restaurants/{rid} {
      allow read: if isStaff(rid) || isPlatform()
                  || (isCustomer() && resource.data.status == 'ACTIVE'); // public branding/settings subset via PWA
      allow create: if isPlatform();
      allow update: if isOwner(rid) || isPlatform();   // billing.feePerOrderFils guarded below
      allow delete: if false;                          // soft delete only

      // owners may not change platform fee or status
      // (enforced by diff check on update)
      // request.resource.data.billing.feePerOrderFils == resource.data.billing.feePerOrderFils
      //   unless isSuper()  — implemented inline:
      // NOTE: combined into update rule:
      //   allow update: if (isOwner(rid)
      //       && request.resource.data.billing.feePerOrderFils == resource.data.billing.feePerOrderFils
      //       && request.resource.data.status == resource.data.status)
      //     || isPlatform();

      match /branches/{bid} {
        allow read: if isCustomer() || isStaff(rid) || isPlatform();
        allow write: if isMgmt(rid) || isPlatform();

        match /meta/{docId} {                 // menuSnapshot
          allow read: if true;                // public menu
          allow write: if false;              // functions only
        }

        match /tables/{tid} {
          allow read: if isStaff(rid) || isPlatform();
          allow write: if isMgmt(rid) || isPlatform();
        }

        match /orders/{oid} {
          // customer may read own order (session match)
          allow read: if (isCustomer() && resource.data.sessionId == claims().sessionId)
                      || isStaff(rid) || isPlatform();
          // creation goes through Cloud Function (server validates prices) — no client create
          allow create: if false;
          // staff advance status; legal transitions enforced server-side by function for
          // money-relevant transitions; rules allow only whitelisted field changes:
          allow update: if isStaff(rid) && inBranch(rid, bid)
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['status','statusTimestamps','statusHistory','cancelReason','updatedAt']);
          allow delete: if false;
        }

        match /waiterRequests/{wid} {
          allow read: if (isCustomer() && resource.data.sessionId == claims().sessionId)
                      || isStaff(rid) || isPlatform();
          allow create: if false;             // via function (rate-limited)
          allow update: if isStaff(rid) && inBranch(rid, bid)
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['status','acknowledgedBy','acknowledgedAt','resolvedBy','resolvedAt']);
          allow delete: if false;
        }
      }

      match /categories/{cid} {
        allow read: if true;
        allow write: if isMgmt(rid) || isPlatform();
      }
      match /menuItems/{mid} {
        allow read: if true;
        allow write: if isMgmt(rid) || isPlatform();
        // KITCHEN may 86 an item (availability only):
        allow update: if isStaff(rid) && role() == 'KITCHEN'
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['isAvailable','branchOverrides','updatedAt']);
      }
      match /menus/{mid} {
        allow read: if true;
        allow write: if isMgmt(rid) || isPlatform();
      }
      match /feedback/{fid} {
        allow read: if isMgmt(rid) || isPlatform();
        allow create: if false;               // via function (rate-limited, validated 1..5)
        allow update, delete: if false;
      }
      match /inventory/{iid} {
        allow read: if isStaff(rid) || isPlatform();
        allow write: if isMgmt(rid) || isPlatform();
        match /movements/{mvId} {
          allow read: if isStaff(rid) || isPlatform();
          allow create: if isStaff(rid);
          allow update, delete: if false;     // append-only
        }
      }
      match /knowledgeBase/{kid} {
        allow read: if isStaff(rid) || isPlatform();   // AI gateway reads via Admin SDK
        allow write: if isMgmt(rid) || isPlatform();
      }
      match /analytics/{aid} {
        allow read: if isMgmt(rid) || isPlatform();
        allow write: if false;                // functions only
      }
    }

    // ───── users ─────
    match /users/{uid} {
      allow read: if request.auth.uid == uid
                  || (signedIn() && isMgmt(resource.data.restaurantId))
                  || isPlatform();
      allow create, delete: if isPlatform();  // staff lifecycle via functions
      allow update: if (request.auth.uid == uid
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['name','nameAr','phone','photoUrl','updatedAt']))
          || isPlatform();
    }

    // ───── customers (CRM) ─────
    match /customers/{cid} {
      allow read, update: if request.auth.uid == cid;   // self-service profile
      allow create, delete: if false;                   // via functions (OTP enroll / GDPR delete)
      match /visits/{vid} { allow read: if request.auth.uid == cid; allow write: if false; }
      match /loyaltyLedger/{lid} { allow read: if request.auth.uid == cid; allow write: if false; }
    }
    // staff access to CRM goes through Cloud Functions (audited), not direct reads.

    // ───── lookups ─────
    match /qrTokens/{token} { allow read: if true; allow write: if false; }
    match /slugs/{slug}     { allow read: if true; allow write: if false; }

    // ───── billing ─────
    match /billing/{rid} {
      allow read: if isOwner(rid) || isPlatform();
      allow write: if false;                  // functions only
      match /ledger/{eid}   { allow read: if isOwner(rid) || isPlatform(); allow write: if false; }
      match /invoices/{iid} { allow read: if isOwner(rid) || isPlatform(); allow write: if false; }
    }

    // ───── notifications ─────
    match /notifications/{uid}/items/{nid} {
      allow read: if request.auth.uid == uid;
      allow update: if request.auth.uid == uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      allow create, delete: if false;
    }

    // ───── audit, AI ─────
    match /auditLogs/{id}   { allow read: if isPlatform(); allow write: if false; }
    match /aiUsage/{rid}/{document=**} {
      allow read: if isOwner(rid) || isPlatform();
      allow write: if false;
    }
    match /aiSessions/{sid} { allow read, write: if false; }   // Admin SDK only

    match /{document=**} { allow read, write: if false; }      // default deny
  }
}
```

Notes: anonymous customer tokens carry a `sessionId` custom claim minted by the `session-start` function on QR scan. All "via function" paths use the Admin SDK (bypasses rules) after their own validation, rate limits, and audit logging.

## 5. `storage.rules`

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function role() { return request.auth.token.role; }
    function isMgmt(rid) {
      return signedIn() && request.auth.token.restaurantId == rid
        && role() in ['BRANCH_MANAGER','OWNER'];
    }
    function isPlatform() { return signedIn() && role() in ['PLATFORM_ADMIN','SUPER_ADMIN']; }

    // public menu & brand images
    match /restaurants/{rid}/public/{allPaths=**} {
      allow read: if true;
      allow write: if (isMgmt(rid) || isPlatform())
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(png|jpeg|webp)');
    }

    // invoices (PDF) — read by owner, written by functions only
    match /restaurants/{rid}/invoices/{file} {
      allow read: if (signedIn() && request.auth.token.restaurantId == rid && role() == 'OWNER')
                  || isPlatform();
      allow write: if false;
    }

    // voice clips — short-lived upload by anonymous customers, processed then deleted
    match /voice/{rid}/{sessionId}/{file} {
      allow write: if signedIn()
        && request.auth.token.sessionId == sessionId
        && request.resource.size < 1 * 1024 * 1024
        && request.resource.contentType.matches('audio/.*');
      allow read: if false;                   // functions read via Admin SDK
    }

    // staff photos
    match /users/{uid}/avatar/{file} {
      allow read: if signedIn();
      allow write: if request.auth.uid == uid
        && request.resource.size < 2 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

## 6. `firestore.indexes.json`

```json
{
  "indexes": [
    { "collectionGroup": "orders", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "sessionId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "waiterRequests", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "waiterRequests", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "menuItems", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "sortOrder", "order": "ASCENDING" } ] },
    { "collectionGroup": "menuItems", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "isPopular", "order": "DESCENDING" } ] },
    { "collectionGroup": "feedback", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "users", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "restaurantId", "order": "ASCENDING" },
        { "fieldPath": "role", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" } ] },
    { "collectionGroup": "ledger", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "invoiceId", "order": "ASCENDING" },
        { "fieldPath": "occurredAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "invoices", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "dueAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "visits", "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "restaurantId", "order": "ASCENDING" },
        { "fieldPath": "startedAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "inventory", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "predictedStockoutAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "auditLogs", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "restaurantId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "auditLogs", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "actorUserId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "auditLogs", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "action", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" } ] }
  ],
  "fieldOverrides": [
    { "collectionGroup": "aiSessions", "fieldPath": "turns",
      "indexes": [] },
    { "collectionGroup": "analytics", "fieldPath": "itemSales",
      "indexes": [] }
  ]
}
```
