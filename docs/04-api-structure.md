# Firefly X TalkTable — API Structure

**Document:** 04-api-structure.md
Complete API surface of the target platform. Two transport styles:

- **HTTPS callable / REST Cloud Functions** (Functions v2, region `europe-west1`), fronted by Next.js route handlers where SSR is involved. All endpoints require **Firebase App Check**.
- **Direct Firestore reads via security rules** for realtime surfaces (listeners), catalogued in §9.

**Conventions**
- Auth column: `anon` = anonymous Firebase Auth session (customer, carries `sessionId` claim), `staff(R…)` = Firebase ID token with listed roles, `none` = public, `webhook` = signature-verified.
- Errors use the envelope:
```typescript
interface ApiError { error: { code: ErrorCode; message: string; messageAr: string; details?: unknown; requestId: string } }
type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION" | "ALREADY_EXISTS" | "RESOURCE_EXHAUSTED"   // rate limit
  | "ABORTED"            // tx conflict, retryable
  | "UNAVAILABLE"        // dependency down (e.g. all AI providers)
  | "INTERNAL";
```
- Rate limits: enforced per identity (uid) and per IP; tiers defined in `05-security-architecture.md` §5; per-endpoint values listed below.
- All money fields are integer **fils**.

---

## 1. Auth Group

| # | Endpoint | Method/Type | Auth | Roles | Rate limit |
|---|---|---|---|---|---|
| 1.1 | `auth-sessionStart` | callable | none → anon | customer bootstrap | 30/min/IP |
| 1.2 | `auth-staffLogin` | Firebase Auth SDK (email+password) | — | all staff | Firebase built-in + 5 fails → lockout |
| 1.3 | `auth-enrollMfa` | Firebase Auth SDK (TOTP/SMS) | staff | OWNER+, admins (mandatory) | — |
| 1.4 | `auth-revokeSessions` | callable | staff | self, or MGMT for subordinates, admins | 10/hr |
| 1.5 | `auth-customerEnroll` | callable | anon | customer (phone OTP via Firebase) | 5/hr/IP |

```typescript
// 1.1 auth-sessionStart — called on QR scan; mints anonymous user with claims
interface SessionStartReq { qrToken: string; language: "ar" | "en"; deviceId: string }
interface SessionStartRes {
  customToken: string;             // sign-in token with claims {sessionId}
  restaurant: { id: string; name: string; nameAr?: string; logoUrl?: string; brandColor?: string };
  branch: { id: string; name: string; isOpen: boolean; ordersPaused: boolean };
  table: { id: string; number: number; label?: string };
  menuSnapshotPath: string;        // Firestore path to read menu
  sessionId: string;
}
// Errors: NOT_FOUND (bad/disabled token), FAILED_PRECONDITION (restaurant suspended)

// 1.5 auth-customerEnroll — link verified phone identity to CRM
interface CustomerEnrollReq { restaurantId: string; consent: { profile: boolean; marketing: boolean } }
interface CustomerEnrollRes { customerId: string; profile: CustomerRestaurantProfile }
```

## 2. Customer Group

| # | Endpoint | Type | Auth | Rate limit |
|---|---|---|---|---|
| 2.1 | `customer-createOrder` | callable | anon/customer | 6/10min/session |
| 2.2 | `customer-cancelOrder` | callable | anon/customer | 3/hr/session |
| 2.3 | `customer-createWaiterRequest` | callable | anon/customer | 1 open per type; 10/hr/session |
| 2.4 | `customer-submitFeedback` | callable | anon/customer | 3/day/session |
| 2.5 | `customer-aiChat` | HTTPS streaming (SSE) | anon/customer | 20 turns/10min/session; daily token budget |
| 2.6 | `customer-aiVoice` | HTTPS multipart | anon/customer | 15/10min/session |
| 2.7 | `customer-getHistory` | callable | customer (phone-auth) | 30/hr |
| 2.8 | `customer-reorder` | callable | customer | 6/10min |
| 2.9 | `customer-redeemPoints` | callable | customer | 5/hr |
| 2.10 | `customer-updateProfile` | callable | customer | 10/hr |
| 2.11 | `customer-exportData` / `customer-deleteAccount` | callable | customer | 1/day |

```typescript
// 2.1 createOrder — server recomputes ALL prices from menu; client prices ignored
interface CreateOrderReq {
  idempotencyKey: string;                       // client uuid
  items: { menuItemId: string; quantity: number; notes?: string }[];
  notes?: string;
  source: "QR_MENU" | "AI_CHAT" | "AI_VOICE";
  redeemPoints?: number;
}
interface CreateOrderRes { orderId: string; orderNumber: number; totalFils: number; etaMinutes: number; orderPath: string /* listen here */ }
// Errors: FAILED_PRECONDITION (kitchen closed/paused, item unavailable — details.unavailableItemIds),
//         INVALID_ARGUMENT (qty<1 or >20, items empty), RESOURCE_EXHAUSTED

// 2.2 cancelOrder — allowed only while status == PENDING
interface CancelOrderReq { orderId: string; reason?: string }

// 2.3 createWaiterRequest
interface WaiterRequestReq { type: "CALL_WAITER"|"REQUEST_BILL"|"WATER_REFILL"|"ASSISTANCE"; note?: string }
interface WaiterRequestRes { requestId: string; requestPath: string }
// Errors: ALREADY_EXISTS (open request of same type)

// 2.4 submitFeedback
interface FeedbackReq { orderId?: string; foodRating: 1|2|3|4|5; serviceRating: 1|2|3|4|5; atmosphereRating: 1|2|3|4|5; comment?: string }

// 2.5 aiChat — POST /ai/chat, response = SSE stream
interface AiChatReq { sessionId: string; message: string; language: "ar"|"en" }
// SSE events: {type:"token", text} | {type:"toolEffect", cart: CartState}
//             | {type:"done", usage:{inputTokens,outputTokens}} | {type:"error", code}
// Errors: UNAVAILABLE (all providers down), RESOURCE_EXHAUSTED (budget), FAILED_PRECONDITION (session locked for abuse)

// 2.6 aiVoice — multipart {audio: Opus ≤1MB ≤30s, language?: "auto"}
interface AiVoiceRes {
  transcript: string; confidence: number;
  replyText: string; replyAudioUrl: string | null;   // null when TTS degraded
  cartDelta?: CartState;
}

// 2.9 redeemPoints
interface RedeemReq { points: number }              // converted at restaurant's redemption rate
interface RedeemRes { discountFils: number; remainingPoints: number }
```

## 3. Staff Group (Waiter / Kitchen / Cashier)

Realtime *reads* are direct Firestore listeners (§9). Mutations:

| # | Endpoint | Type | Roles | Rate limit |
|---|---|---|---|---|
| 3.1 | `staff-updateOrderStatus` | callable | KITCHEN, WAITER, CASHIER, BRANCH_MANAGER, OWNER | 120/min/uid |
| 3.2 | `staff-rejectOrder` | callable | KITCHEN, BRANCH_MANAGER+ | 30/min |
| 3.3 | `staff-ackWaiterRequest` / `staff-resolveWaiterRequest` | callable | WAITER, BRANCH_MANAGER+ | 120/min |
| 3.4 | `staff-retableOrder` | callable | WAITER, BRANCH_MANAGER+ | 20/min |
| 3.5 | `staff-86Item` | callable | KITCHEN, BRANCH_MANAGER+ | 30/min |
| 3.6 | `staff-setKitchenBusy` / `staff-pauseOrders` | callable | KITCHEN, BRANCH_MANAGER+ | 10/min |
| 3.7 | `staff-completeOrder` | callable | CASHIER, BRANCH_MANAGER, OWNER | 60/min |
| 3.8 | `staff-getCustomerProfile` | callable | WAITER, CASHIER, BRANCH_MANAGER, OWNER (audited) | 30/min |

```typescript
// 3.1 updateOrderStatus — server enforces legal transition graph
//   PENDING→ACCEPTED→PREPARING→READY→SERVED ; PENDING/ACCEPTED→CANCELLED
interface UpdateOrderStatusReq { branchId: string; orderId: string; status: OrderStatus; note?: string }
// Errors: FAILED_PRECONDITION (illegal transition — details.{from,to}), FORBIDDEN (role can't make this transition:
//         CANCELLED needs KITCHEN/MGMT; SERVED needs WAITER/MGMT; COMPLETED only via 3.7)

// 3.7 completeOrder — SERVED→COMPLETED; records payment; fires billing trigger
interface CompleteOrderReq {
  branchId: string; orderId: string;
  payment: { method: "CASH"|"CARD_TERMINAL"|"STRIPE"; amountFils: number; reference?: string };
}
// Errors: FAILED_PRECONDITION (not SERVED), INVALID_ARGUMENT (amount mismatch beyond tolerance)

// 3.5 86Item
interface EightySixReq { menuItemId: string; branchId: string; available: boolean }
```

## 4. Management Group (Branch Manager / Owner)

| # | Endpoint | Type | Roles | Rate limit |
|---|---|---|---|---|
| 4.1 | `mgmt-upsertCategory` / `mgmt-deleteCategory` | callable | MGMT | 60/min |
| 4.2 | `mgmt-upsertMenuItem` / `mgmt-deleteMenuItem` | callable | MGMT | 60/min |
| 4.3 | `mgmt-setBranchOverride` | callable | MGMT | 60/min |
| 4.4 | `mgmt-uploadMenuImage` | Storage + callable (signed URL) | MGMT | 30/hr |
| 4.5 | `mgmt-inviteEmployee` | callable | OWNER (any role), BRANCH_MANAGER (waiter/cashier/kitchen only) | 20/day |
| 4.6 | `mgmt-updateEmployee` / `mgmt-deactivateEmployee` | callable | as 4.5 | 60/day |
| 4.7 | `mgmt-upsertInventoryItem` / `mgmt-recordMovement` | callable | MGMT (movement: any staff) | 120/min |
| 4.8 | `mgmt-upsertKnowledgeItem` / `mgmt-deleteKnowledgeItem` | callable | MGMT | 60/min |
| 4.9 | `mgmt-upsertTable` / `mgmt-rotateQrToken` / `mgmt-printQrSheet` | callable | MGMT | 60/min; print 10/day |
| 4.10 | `mgmt-upsertBranch` / `mgmt-setBranchActive` | callable | OWNER | 30/day |
| 4.11 | `mgmt-updateRestaurantSettings` | callable | OWNER | 30/hr |

```typescript
// 4.2 upsertMenuItem (create when id omitted)
interface UpsertMenuItemReq { id?: string; item: Omit<MenuItemDoc,"createdAt"|"updatedAt"> }
interface UpsertMenuItemRes { id: string; menuVersionBumped: boolean }
// Errors: INVALID_ARGUMENT (priceFils<=0; unknown allergen key; nameAr missing when restaurant requires AR)

// 4.5 inviteEmployee — creates Auth user (temp password / email link), users doc, claims
interface InviteEmployeeReq { email: string; name: string; role: StaffRole; branchIds: string[] }
interface InviteEmployeeRes { userId: string; inviteSent: boolean }
// Errors: ALREADY_EXISTS, FORBIDDEN (BRANCH_MANAGER inviting MGMT role)

// 4.9 rotateQrToken — invalidates old token immediately
interface RotateQrReq { branchId: string; tableId: string }
interface RotateQrRes { qrToken: string; qrPngUrl: string }
```

## 5. Analytics Group

| # | Endpoint | Type | Roles | Rate limit |
|---|---|---|---|---|
| 5.1 | `analytics-getDashboard` | callable | MGMT (branch-scoped), OWNER | 60/min |
| 5.2 | `analytics-getTimeSeries` | callable | MGMT, OWNER | 60/min |
| 5.3 | `analytics-getItemReport` | callable | MGMT, OWNER | 30/min |
| 5.4 | `analytics-getFunnel` | callable | MGMT, OWNER | 30/min |
| 5.5 | `analytics-getServiceMetrics` | callable | MGMT, OWNER | 30/min |
| 5.6 | `analytics-exportCsv` | callable → signed URL | OWNER | 10/day |

```typescript
interface TimeSeriesReq {
  branchIds: string[];                       // validated against scope
  metric: "revenue"|"orders"|"avgTicket"|"scans"|"prepTime"|"ratings";
  granularity: "hour"|"day"|"week"|"month";
  from: string; to: string;                  // ISO dates, range ≤ 400 days
}
interface TimeSeriesRes { series: { branchId: string; points: { t: string; v: number }[] }[]; asOf: string }
```

## 6. BI Group (AI Business Intelligence)

| # | Endpoint | Type | Roles | Rate limit |
|---|---|---|---|---|
| 6.1 | `bi-getRevenueForecast` | callable | OWNER, BRANCH_MANAGER | 30/day |
| 6.2 | `bi-getInventoryPredictions` | callable | MGMT | 30/day |
| 6.3 | `bi-getMenuOptimization` | callable | OWNER | 10/day |
| 6.4 | `bi-getStaffingRecommendations` | callable | MGMT | 10/day |
| 6.5 | `bi-askData` | SSE streaming | OWNER | 30/day; token budget |
| 6.6 | `bi-applyMenuRecommendation` | callable | OWNER | 20/day |

```typescript
// 6.1
interface ForecastRes {
  branchId: string; horizonDays: 14;
  daily: { date: string; p50Fils: number; p10Fils: number; p90Fils: number }[];
  narrative: string;                  // AI-generated, viewer language
  backtestMape: number; dataWindow: { from: string; to: string };
  generatedAt: string; model: string; // e.g. "claude-fable-5"
}
// Errors: FAILED_PRECONDITION (insufficient history <28 days)

// 6.5 askData — model answers ONLY via whitelisted query tools
interface AskDataReq { question: string; branchIds?: string[] }
// SSE: {type:"token"} | {type:"queryUsed", name, params, resultSummary} | {type:"done"}
```

## 7. CRM Group (staff-facing)

| # | Endpoint | Type | Roles | Rate limit |
|---|---|---|---|---|
| 7.1 | `crm-searchCustomers` | callable | MGMT, OWNER | 30/min |
| 7.2 | `crm-getCustomerDetail` | callable | MGMT, OWNER, WAITER/CASHIER (limited view) | 60/min (audited) |
| 7.3 | `crm-adjustPoints` | callable | OWNER | 20/day (audited) |
| 7.4 | `crm-getSegments` | callable | OWNER | 30/day |
| 7.5 | `crm-anonymizeCustomer` | callable | PLATFORM_ADMIN (on verified request) | — |

```typescript
// 7.2 — waiter/cashier receive only: tier, allergies, favorites; MGMT also history & points
interface CustomerDetailRes {
  tier: string; allergies: string[]; favorites: {menuItemId: string; name: string}[];
  visitCount?: number; lastVisitAt?: string; loyaltyPoints?: number;
  recentOrders?: { orderId: string; date: string; totalFils: number }[];
}
```

## 8. Billing Group

| # | Endpoint | Type | Auth | Rate limit |
|---|---|---|---|---|
| 8.1 | `billing-onOrderCompleted` | Firestore trigger | system | — |
| 8.2 | `billing-onOrderRefunded` | Firestore trigger | system | — |
| 8.3 | `billing-generateInvoices` | scheduled (monthly, 1st 02:00 Asia/Amman) | system | — |
| 8.4 | `billing-chargeInvoice` | Cloud Tasks worker | system | — |
| 8.5 | `billing-stripeWebhook` | HTTPS | webhook (Stripe signature) | — |
| 8.6 | `billing-getStatement` | callable | OWNER | 30/min |
| 8.7 | `billing-setupPaymentMethod` | callable → Stripe SetupIntent client secret | OWNER | 10/day |
| 8.8 | `billing-retryInvoice` | callable | OWNER, PLATFORM_ADMIN | 5/day |
| 8.9 | `billing-recordManualPayment` | callable | PLATFORM_ADMIN (audited) | — |

```typescript
// 8.1 trigger contract (per-order charge event)
// onUpdate orders/* where status transitions → COMPLETED:
//   create billing/{rid}/ledger/chg_{orderId} (create-only ⇒ idempotent)
//   { type:"ORDER_FEE", amountFils: restaurant.billing.feePerOrderFils /*100*/, orderId, branchId,
//     orderTotalFils, occurredAt: completedAt, invoiceId: null }
//   then increment billing/{rid}.balanceFils

// 8.5 stripeWebhook — events handled:
//   setup_intent.succeeded            → save default payment method
//   invoice.payment_succeeded (n/a — we charge PaymentIntents) 
//   payment_intent.succeeded          → invoice status=PAID, paidAt
//   payment_intent.payment_failed     → attempts++, schedule retry (Cloud Tasks: +3d, +6d, +10d)
//   charge.dispute.created            → flag invoice, alert platform admin
// Signature: Stripe-Signature verified with endpoint secret; replay window 5 min.

// 8.6
interface StatementReq { period?: { from: string; to: string } }
interface StatementRes {
  balanceFils: number; status: "OK"|"PAST_DUE"|"SUSPENDED";
  entries: LedgerEntryDoc[]; nextPageToken?: string;
  invoices: { id: string; period: string; totalFils: number; status: string; pdfUrl?: string }[];
}
```

## 9. Platform Admin Group

| # | Endpoint | Type | Roles | Notes |
|---|---|---|---|---|
| 9.1 | `admin-onboardRestaurant` | callable | PLATFORM_ADMIN | creates restaurant, owner user, main branch, QR kit job |
| 9.2 | `admin-setRestaurantStatus` | callable | PLATFORM_ADMIN (SUSPEND needs SUPER_ADMIN) | ACTIVE/PAST_DUE/SUSPENDED |
| 9.3 | `admin-setUserRole` | callable | SUPER_ADMIN | sets claims; PLATFORM_ADMIN creation requires SUPER_ADMIN |
| 9.4 | `admin-getPlatformHealth` | callable | PLATFORM_ADMIN | orders/min, error rates, provider failover counts, listener spend |
| 9.5 | `admin-getAiUsage` | callable | PLATFORM_ADMIN | per-restaurant tokens/cost, top consumers, budget breaches |
| 9.6 | `admin-setFeePerOrder` | callable | SUPER_ADMIN | overrides 100-fils default per restaurant (audited) |
| 9.7 | `admin-impersonate` | callable | SUPER_ADMIN | mints scoped read-only token, 30 min TTL, heavily audited |
| 9.8 | `admin-featureFlags` | callable | PLATFORM_ADMIN | remote config per restaurant |
| 9.9 | `admin-generateQrKit` | callable | PLATFORM_ADMIN, OWNER | PDF print sheet to Storage |

```typescript
// 9.1
interface OnboardReq {
  restaurant: { name: string; nameAr?: string; slug: string; timezone?: string };
  owner: { email: string; name: string; phone?: string };
  branch: { name: string; address?: string; tableCount: number };
}
interface OnboardRes { restaurantId: string; branchId: string; ownerUserId: string; qrKitJobId: string }
```

## 10. Realtime Event Catalog

There is no separate event bus — "events" are Firestore document writes observed by listeners. Catalog of every (listener query → event) pair with payload = the doc shape from `03-database-schema.md`:

| Event name | Trigger (doc transition) | Listeners | Payload |
|---|---|---|---|
| `order.created` | new doc in `branches/{b}/orders`, status=PENDING | KDS, waiter, manager, customer (own doc) | `OrderDoc` |
| `order.accepted` | status PENDING→ACCEPTED | customer, waiter, KDS | `OrderDoc` (statusTimestamps.ACCEPTED) |
| `order.rejected` | status PENDING→CANCELLED + cancelReason | customer, waiter | `OrderDoc` |
| `order.preparing` | →PREPARING | customer, waiter | `OrderDoc` |
| `order.ready` | →READY | waiter (priority), customer, KDS (column move) | `OrderDoc` |
| `order.served` | →SERVED | customer, cashier, KDS dismiss | `OrderDoc` |
| `order.completed` | →COMPLETED | manager tiles, billing trigger | `OrderDoc` |
| `order.cancelled` | →CANCELLED from any pre-SERVED state | all order listeners | `OrderDoc` |
| `waiterRequest.created` | new doc, status=OPEN | waiter queue, customer | `WaiterRequestDoc` |
| `waiterRequest.acknowledged` | OPEN→ACKNOWLEDGED | customer, waiter queue | `WaiterRequestDoc` |
| `waiterRequest.resolved` | →RESOLVED | customer, waiter queue | `WaiterRequestDoc` |
| `waiterRequest.escalated` | escalatedAt set by scheduler | branch manager (+FCM) | `WaiterRequestDoc` |
| `menu.updated` | `branches/{b}/meta/menuSnapshot` version bump | customer PWA (refetch), KDS 86 sync | `{version, generatedAt}` |
| `table.sessionChanged` | `tables/{t}.currentSessionId` write | waiter table map | `TableDoc` |
| `branch.pauseChanged` | `ordersPaused` / `kitchenBusyExtraMinutes` write | customer PWA, KDS, waiter | `BranchDoc` subset |
| `inventory.lowStock` | `quantity` < `lowStockThreshold` (function writes notification) | manager notifications | `NotificationDoc(type=LOW_STOCK)` |
| `billing.invoiceIssued` / `billing.invoicePaid` / `billing.invoiceFailed` | invoice status writes | owner console + notification | `InvoiceDoc` |
| `notification.created` | new doc in `notifications/{uid}/items` | the target user (+FCM mirror) | `NotificationDoc` |
| `restaurant.statusChanged` | `restaurants/{r}.status` write | all staff apps (suspension banner) | `{status}` |

**FCM push topics** (for backgrounded devices, mirrors of the above): `branch_{branchId}_waiters`, `branch_{branchId}_kitchen`, `branch_{branchId}_mgmt`, `user_{uid}`.

**Listener contracts (client must use exactly these queries to stay within rules + index plan):**

```typescript
// KDS:     collection(b,"orders").where("status","in",["PENDING","ACCEPTED","PREPARING","READY"]).orderBy("createdAt").limit(100)
// Waiter:  same as KDS for READY/SERVED slice + collection(b,"waiterRequests").where("status","in",["OPEN","ACKNOWLEDGED"]).orderBy("createdAt")
// Customer: doc(orderPath), doc(requestPath), doc(menuSnapshotPath), doc(branchPath)
// Manager: doc(restaurants/{r}/analytics/{branchId}_{today})
```
