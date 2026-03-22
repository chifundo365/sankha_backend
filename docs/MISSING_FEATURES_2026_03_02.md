# Missing & Incomplete Features — Audit Date: 2 March 2026

> **Audited by:** AI code review against full codebase (Prisma schema, controllers, services, routes, middleware, jobs, templates, utils)
>
> **Codebase snapshot:** 141 API endpoints, 20 Prisma models, 14 controllers, 15 services, 2 background jobs, 8 middleware, 14 Zod schemas, 5 email templates

---

## Table of Contents

1. [MVP-Critical (Must Fix Before Launch)](#1-mvp-critical)
2. [High Priority (Should Have at Launch)](#2-high-priority)
3. [Medium Priority (Post-Launch Month 1–2)](#3-medium-priority)
4. [Low Priority (V2+ Features)](#4-low-priority)
5. [Partial Implementations & Gaps](#5-partial-implementations--gaps)
6. [Summary Matrix](#6-summary-matrix)

---

## 1. MVP-Critical

These will cause **real financial harm or total loss of user trust** if not present at launch.

### 1.1 Refund Processing

**Status:** ❌ Not implemented

**Impact:** If a seller never delivers and the release code expires, the buyer permanently loses their money. No automated or manual refund path exists.

**What exists today:**
- `REFUNDED` status in `order_status` and `payment_status` enums
- Order cancellation restores stock but does NOT trigger a payment refund

**What's missing:**
- No refund controller, service, or route
- No PayChangu refund API integration
- No refund reason tracking
- No stock restoration on refund (separate from cancellation)
- No auto-refund trigger when release codes expire
- No admin-initiated refund endpoint

**Required implementation:**

| Component | Description |
|-----------|-------------|
| `src/services/refund.service.ts` | Core refund logic: validate eligibility, call PayChangu refund API, update order/payment status, restore stock, create transaction record |
| `src/controllers/refund.controller.ts` | `POST /api/orders/:orderId/refund` (admin), `POST /api/orders/:orderId/request-refund` (buyer) |
| `src/routes/refund.routes.ts` | Route definitions with auth + validation |
| `src/schemas/refund.schema.ts` | Zod validation for refund requests |

**Minimum viable version:** Admin-only `POST /api/admin/orders/:orderId/refund` that:
1. Validates order is paid but not completed
2. Calls PayChangu refund API (or marks for manual refund)
3. Updates order status → `REFUNDED`, payment status → `REFUNDED`
4. Restores stock quantities
5. Creates `REFUND` transaction in ledger

**PayChangu refund API:** Needs research — check if PayChangu supports programmatic refunds or if refunds must be initiated from their dashboard.

---

### 1.2 Release Code Expiry Background Job

**Status:** ❌ Not implemented

**Impact:** Release codes have `expires_at` timestamps but nothing ever checks them. Expired orders sit in `CONFIRMED` status forever. Buyer money is trapped.

**What exists today:**
- `release_code_expires_at` field on `orders` table
- `release_code_status` enum with `EXPIRED` value
- `isReleaseCodeExpired()` utility function in `src/utils/releaseCode.ts`
- Two other background jobs exist as patterns: `paymentVerification.job.ts` and `bulkUploadCleanup.job.ts`

**What's missing:**
- No `releaseCodeExpiry.job.ts` background job
- No automatic status change from `PENDING` → `EXPIRED`
- No automatic order cancellation on expiry
- No automatic refund trigger on expiry

**Required implementation:**

```
src/jobs/releaseCodeExpiry.job.ts
```

**Logic (run every hour or daily):**
1. Query: `SELECT * FROM orders WHERE release_code_status = 'PENDING' AND release_code_expires_at < NOW()`
2. For each expired order:
   - Set `release_code_status` → `EXPIRED`
   - Set order `status` → `CANCELLED`
   - Restore stock (reuse existing stock restoration logic)
   - Create order message: "Release code expired. Order automatically cancelled."
   - Queue refund (once refund service exists)
   - Notify buyer via email/SMS
3. Log summary: "Processed X expired release codes"

**Configuration:** `RELEASE_CODE_EXPIRY_CHECK_INTERVAL_MS` (default: 3600000 = 1 hour)

---

## 2. High Priority

Not strictly MVP-blocking but significantly affect user trust and platform quality.

### 2.1 Shop Rating Aggregation & Ranking

**Status:** ✅ Implemented

**Impact:** Buyers can now compare shops by quality; searches and shop listings are enhanced with rating-based signals.

**What exists today:**
- `reviews` table with `rating` (1–5) per review, linked to `shop_products`
- `shops` model includes `avg_rating`, `total_reviews`, `shop_score`
- Aggregation logic in `review.controller.ts` and centralized in `shopRating.service.ts` (create/update/delete)
- Search results include `shop_avg_rating`, `shop_total_reviews`, `shop_score` in shop entries
- `shopController.getAllShops` supports `sort_by=shop_score|avg_rating|total_reviews` and `order=asc|desc`
- Daily background job: `shopRatingAggregation.job.ts` (enabled by `SHOP_RATING_AGGREGATION_ENABLED=true`)

**What's missing:**

| Component | Description |
|-----------|-------------|666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666`
| Schema fields | `shops.avg_rating Decimal?`, `shops.total_reviews Int @default(0)`, `shops.shop_score Decimal?` |
| Aggregation trigger | After review creation/update/deletion, recalculate shop's avg_rating and total_reviews |
| Composite score | `shop_score = (avg_rating × 0.4) + (is_verified × 0.2) + (completed_orders_normalized × 0.3) + (recency × 0.1)` |
| Background job | Periodic recalculation (daily) for composite scores |
| Search integration | Sort/filter shops by score in search results |

**Migration required:** Add columns to `shops` table.

---

### 2.2 Email Verification on Signup

**Status:** ❌ Not implemented

**Impact:** Fake accounts, typo'd emails that can never receive order notifications or release codes.

**What exists today:**
- Email service is fully functional (Resend integration)
- Password reset emails work
- No `email_verified` field on `users` model

**What's missing:**

| Component | Description |
|-----------|-------------|
| Schema fields | `users.email_verified Boolean @default(false)`, `users.email_verify_token String?`, `users.email_verify_expires DateTime?` |
| Migration | Add columns to `users` table |
| `POST /api/auth/register` update | Generate verification token, send verification email after registration |
| `GET /api/auth/verify-email/:token` | New endpoint to verify email |
| `POST /api/auth/resend-verification` | Resend verification email |
| Email template | `emailVerificationTemplate()` in `email.templates.ts` |
| Gate certain actions | Optionally require verified email for checkout/review |

---

### 2.3 Notification Queue (Background Processing)

**Status:** ❌ Not implemented (notifications are sent synchronously)

**Impact:** If Africa's Talking or Resend API is slow or down, the entire request hangs. At scale, this causes timeouts.

**What exists today:**
- `email.service.ts` sends emails directly via Resend API (731 lines)
- `sms.service.ts` sends SMS directly via Africa's Talking API (218 lines)
- `notification.service.ts` is a thin wrapper (85 lines)
- No queue, no retry, no dead letter

**What's missing:**

| Component | Description |
|-----------|-------------|
| Queue system | BullMQ with Redis (already have Redis) |
| `src/jobs/notification.job.ts` | Worker that processes email/SMS jobs |
| Queue producers | Replace direct `await sendEmail()` calls with `notificationQueue.add('email', { ... })` |
| Retry logic | 3 retries with exponential backoff |
| Dead letter queue | Failed notifications after retries for manual review |
| Dashboard (optional) | Bull Board for monitoring |

**Severity at MVP:** Low — direct calls work fine for <100 orders/day. Becomes critical at scale.

---

## 3. Medium Priority

Post-launch features that improve UX and seller engagement.

### 3.1 Shop Verification Workflow

**Status:** ⚠️ Partially implemented

**What exists today:**
- `is_verified` flag on `shops` model
- `PATCH /api/shops/:shopId/verify` admin endpoint toggles the flag
- Verified badge concept in search results

**What's missing:**
- No document upload for business registration, ID, proof of address
- No verification request endpoint for sellers
- No admin review queue/dashboard
- No notification to shop owner on approval/rejection
- No verification history or audit trail

**Required:**

| Component | Description |
|-----------|-------------|
| `verification_documents` model | Table to store uploaded documents per shop |
| Upload endpoint | `POST /api/shops/:shopId/verify-request` with document uploads |
| Admin review | `GET /api/admin/shops/pending-verification`, `PATCH /api/admin/shops/:shopId/verify-decision` |
| Email notifications | Templates for approval/rejection |

---

### 3.2 Wishlist / Saved Items

**Status:** ❌ Not implemented

**What's missing:**

| Component | Description |
|-----------|-------------|
| Schema | `wishlists` model with `user_id`, `product_id` (or `shop_product_id`), `created_at`, unique constraint |
| Migration | Create table |
| Controller | `src/controllers/wishlist.controller.ts` |
| Routes | `GET /api/wishlist`, `POST /api/wishlist`, `DELETE /api/wishlist/:id` |
| Schema | `src/schemas/wishlist.schema.ts` |
| "Move to Cart" | Convenience endpoint or frontend action |

**Effort:** Small (1–2 hours). Standard CRUD.

---

### 3.3 Low Stock Alerts

**Status:** ❌ Not implemented

**What exists today:**
- `stock_quantity` tracked on `shop_products`
- Stock changes logged to `shop_products_log`
- No threshold or alert mechanism

**What's missing:**

| Component | Description |
|-----------|-------------|
| Schema field | `shop_products.low_stock_threshold Int @default(5)` |
| Background job | `src/jobs/lowStockAlert.job.ts` — daily check, notify shop owners |
| Email template | "Your product X is running low (Y remaining)" |
| Seller dashboard | Endpoint `GET /api/seller/inventory/low-stock` |

---

### 3.4 Analytics & Reporting

**Status:** ⚠️ Minimal implementation

**What exists today:**
- `GET /api/orders/stats` — basic order statistics for sellers/admins
- `GET /api/admin/bulk-uploads/stats` — bulk upload statistics
- `GET /api/admin/ip-stats` — IP blocking statistics

**What's missing:**

**Seller analytics:**
| Metric | Description |
|--------|-------------|
| Sales over time | Daily/weekly/monthly revenue charts |
| Top-selling products | Ranked by quantity or revenue |
| Wallet balance history | Credits and withdrawals over time |
| Order completion rate | Completed vs cancelled vs refunded |
| Average delivery time | Time from CONFIRMED to DELIVERED |
| View/conversion tracking | How many views → purchases (requires frontend events) |

**Admin analytics:**
| Metric | Description |
|--------|-------------|
| GMV (Gross Merchandise Value) | Total transaction volume |
| Commission earned | Total platform revenue |
| Active shops vs total shops | Platform health metric |
| User growth | New registrations over time |
| Top-performing shops | By revenue, rating, completion rate |
| Search analytics | Popular queries (SearchLog model exists but no dashboard) |

**Export:** CSV/PDF export for all reports.

**Note:** The `SearchLog` model and `search_logs` table already exist and log every search query with `results_count`, `filters`, `response_time_ms`. This data is being collected but has no reporting endpoint.

---

### 3.5 Search Log Analytics Endpoint

**Status:** ⚠️ Data collected but no reporting

**What exists today:**
- `SearchLog` model in Prisma schema
- Search controller logs every query to `search_logs` table
- Indexes on `query`, `created_at`, `results_count`

**What's missing:**
- `GET /api/admin/search-analytics` — top queries, zero-result queries, avg response time
- Dashboard for admin to see what buyers are searching for
- Alerts for frequently searched terms with zero results (demand signal) 

---

## 4. Low Priority

V2/V3 features. Build when user base and feedback justify.

### 4.1 Product Return Flow

**Status:** ❌ Not implemented

**What's missing:**

| Component | Description |
|-----------|-------------|
| Schema | `returns` model with `order_item_id`, `reason`, `status` (PENDING/APPROVED/REJECTED/COMPLETED), `admin_notes` |
| Migration | Create table + enum |
| Endpoints | `POST /api/orders/:orderId/items/:itemId/return`, `GET /api/returns/my-returns`, admin review endpoints |
| Integration | Tie into refund flow (approved return → refund) |
| Stock | Restore stock on completed return |

**Complexity:** High — involves coordination between buyer, seller, and admin. Probably handle manually via support for first 6 months.

---

### 4.2 Price History & Alerts

**Status:** ❌ Not implemented

**What's missing:**

| Component | Description |
|-----------|-------------|
| Schema | `price_history` model: `shop_product_id`, `old_price`, `new_price`, `changed_at` |
| Trigger | Log price changes when `shop_products.price` is updated |
| `price_alerts` model | `user_id`, `product_id`, `target_price`, `is_active` |
| Notification | When price drops below target, notify user |
| Endpoint | `POST /api/price-alerts`, `GET /api/price-alerts`, `DELETE /api/price-alerts/:id` |
| Frontend | Price trend graph on product page |

---

### 4.3 Product Recommendations

**Status:** ❌ Not implemented

**What's missing:**
- "Customers who bought X also bought Y" logic
- "Similar products" based on category, brand, price range
- "Recently viewed" tracking
- Personalized homepage feed

**Complexity:** Ranges from simple (same-category suggestions) to complex (collaborative filtering). Start simple.

---

### 4.4 Multi-Language Support

**Status:** ❌ Not implemented

**Relevance:** Malawi has Chichewa, English, and other languages. For MVP English is fine. Consider Chichewa for SMS notifications first (very high impact for mobile-first users).

---

### 4.5 Seller Chat / In-App Messaging

**Status:** ❌ Not implemented

**What exists today:**
- `whatsapp_number` on `shops` — buyer can contact seller via WhatsApp deep link
- `order_messages` table — system-generated notifications (not user-to-user)

**What's missing:**
- Real-time buyer-seller chat
- WebSocket or SSE infrastructure
- Message history storage
- Push notifications

**Complexity:** High. WhatsApp integration handles this adequately for MVP.

---

### 4.6 Promotional / Discount System

**Status:** ❌ Not implemented

**What's missing:**
- Coupon codes
- Shop-specific promotions
- Flash sales
- Bundle pricing
- Free delivery promotions

---

### 4.7 SEO & Social Sharing

**Status:** ❌ Not implemented (backend concern)

**What's missing:**
- Product page metadata API (for SSR/meta tags)
- Open Graph image generation
- Sitemap generation endpoint
- Canonical URLs for products

---

## 5. Partial Implementations & Gaps

Features that exist but have gaps or edge cases.

### 5.1 Order Cancellation → No Payment Refund

**Status:** ⚠️ Gap

Order cancellation (`POST /api/orders/:orderId/cancel`) restores stock but does **not** refund the payment. If buyer paid via PayChangu and then cancels, their money is stuck.

**Fix needed:** After stock restoration, check if payment exists with status `PAID` and trigger refund (once refund service exists).

---

### 5.2 Delivery Fee Calculation

**Status:** ⚠️ Partially implemented

**What exists:**
- `shops.base_delivery_fee`, `shops.free_delivery_threshold`, `shops.intercity_delivery_fee` fields exist
- `shops.delivery_zones` array exists

**What's missing:**
- No automatic delivery fee calculation in checkout based on buyer's location vs shop's city
- No same-city vs inter-city detection logic
- No free delivery threshold check in cart totals
- Checkout currently doesn't factor in delivery fees

---

### 5.3 Seller Notification on New Order

**Status:** ⚠️ Partially implemented

**What exists:**
- `order_messages` table logs notifications
- Email templates for order confirmation (buyer) and seller payout notification
- SMS service for release codes

**What's missing:**
- No real-time notification to seller when they receive a new order
- No SMS to seller for new orders
- Seller must check their dashboard to discover orders

---

### 5.4 Search — Specs Filter Edge Case

**Status:** ⚠️ Works but limited

The specs filter (`?specs={"RAM":"8GB"}`) does exact key-value matching (case-insensitive LIKE). It does NOT understand:
- Unit equivalence: "8 GB" vs "8GB" vs "8192MB"
- Range queries: "8GB or more"
- Nested specs (specs stored differently across products)

**Acceptable for MVP.** Improve when user complaints arise.

---

### 5.5 Bulk Upload — No Image Upload in Same Flow

**Status:** ⚠️ By design but friction point

Products created via bulk upload start with `listing_status: NEEDS_IMAGES` and are invisible to buyers. Sellers must then:
1. Go to seller inventory → needs-images list
2. Upload images one product at a time

**Gap:** No bulk image upload. If a seller uploads 200 products, they need 200 separate image upload actions. Consider a ZIP upload or drag-and-drop multi-product image matcher.

---

### 5.6 No Test Suite

**Status:** ❌ No automated tests

**What exists:**
- Manual test scripts in `tmp/` directory
- `BULK_UPLOAD_TEST_PLAN.md` and `BULK_UPLOAD_TESTING_GUIDE.md` describe manual procedures

**What's missing:**
- No unit tests
- No integration tests
- No API endpoint tests (Jest, Supertest, Vitest)
- No CI/CD pipeline
- No test database configuration

**Impact:** Every code change risks breaking existing features silently. Critical for long-term maintainability.

---

### 5.7 No API Documentation (Swagger/OpenAPI)

**Status:** ❌ Not implemented

141 endpoints exist but there's no interactive API documentation. All routes have JSDoc comments in route files which could be converted.

**Options:**
- `swagger-jsdoc` + `swagger-ui-express` to auto-generate from JSDoc
- Postman collection export
- Manual OpenAPI spec

---

### 5.8 No Logging Infrastructure

**Status:** ⚠️ Console.log only

All logging is `console.log` / `console.error`. No structured logging, no log levels, no log aggregation.

**What's missing:**
- Structured logger (Winston, Pino)
- Log levels (debug, info, warn, error)
- Request ID tracking across log entries
- Log aggregation service integration (optional)

---

### 5.9 No Health Check Endpoint

**Status:** ❌ Not implemented

No `GET /api/health` or `GET /api/status` endpoint to verify:
- Server is running
- Database is connected
- Redis is connected
- External services are reachable

Useful for uptime monitoring, load balancers, and deployment health checks.

---

### 5.10 No CORS Configuration

**Status:** ⚠️ Needs review

`FRONTEND_URL` exists in `.env` but CORS middleware configuration was not verified. If deploying with a separate frontend domain, CORS must be properly configured.

---

## 6. Summary Matrix

| # | Feature | Priority | Status | Effort | MVP? |
|---|---------|----------|--------|--------|------|
| 1.1 | Refund Processing | 🔴 CRITICAL | ❌ Missing | Medium | **YES** |
| 1.2 | Release Code Expiry Job | 🔴 CRITICAL | ❌ Missing | Small | **YES** |
| 2.1 | Shop Rating/Ranking | 🟠 HIGH | ❌ Missing | Medium | No |
| 2.2 | Email Verification | 🟠 HIGH | ❌ Missing | Small | No |
| 2.3 | Notification Queue | 🟠 HIGH | ❌ Missing | Medium | No |
| 3.1 | Shop Verification Workflow | 🟡 MEDIUM | ⚠️ Partial | Medium | No |
| 3.2 | Wishlist | 🟡 MEDIUM | ❌ Missing | Small | No |
| 3.3 | Low Stock Alerts | 🟡 MEDIUM | ❌ Missing | Small | No |
| 3.4 | Analytics & Reporting | 🟡 MEDIUM | ⚠️ Minimal | Large | No |
| 3.5 | Search Log Analytics | 🟡 MEDIUM | ⚠️ Data exists | Small | No |
| 4.1 | Product Returns | 🟢 LOW | ❌ Missing | Large | No |
| 4.2 | Price History & Alerts | 🟢 LOW | ❌ Missing | Medium | No |
| 4.3 | Recommendations | 🟢 LOW | ❌ Missing | Medium–Large | No |
| 4.4 | Multi-Language | 🟢 LOW | ❌ Missing | Large | No |
| 4.5 | Seller Chat | 🟢 LOW | ❌ Missing | Large | No |
| 4.6 | Promotions/Discounts | 🟢 LOW | ❌ Missing | Medium | No |
| 4.7 | SEO/Social Sharing | 🟢 LOW | ❌ Missing | Small | No |
| 5.1 | Cancel → Refund gap | 🔴 CRITICAL | ⚠️ Gap | Small | **YES** |
| 5.2 | Delivery Fee Calc | 🟡 MEDIUM | ⚠️ Partial | Medium | No |
| 5.3 | Seller New Order Alert | 🟠 HIGH | ⚠️ Partial | Small | No |
| 5.4 | Specs Filter Edge Cases | 🟢 LOW | ⚠️ Acceptable | Medium | No |
| 5.5 | Bulk Image Upload | 🟢 LOW | ⚠️ By design | Medium | No |
| 5.6 | Automated Tests | 🟠 HIGH | ❌ Missing | Large | No |
| 5.7 | API Documentation | 🟡 MEDIUM | ❌ Missing | Medium | No |
| 5.8 | Structured Logging | 🟡 MEDIUM | ⚠️ Console only | Small | No |
| 5.9 | Health Check | 🟡 MEDIUM | ❌ Missing | Tiny | No |
| 5.10 | CORS Config Review | 🟡 MEDIUM | ⚠️ Needs check | Tiny | No |

---

## Quick Reference: What to Build Next

**Before launch (1–3 days):**
1. Release code expiry job (~2 hours)
2. Refund service — admin-only minimum viable version (~4 hours)
3. Wire cancellation → refund (~1 hour)

**First month post-launch:**
4. Email verification on signup
5. Shop rating aggregation
6. Seller notification on new order (SMS)
7. Health check endpoint
8. Search log analytics for admin

**Second month:**
9. Wishlist
10. Low stock alerts
11. Notification queue (BullMQ)
12. API documentation (Swagger)
13. Automated test suite (start with critical paths)
