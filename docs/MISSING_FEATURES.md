# Missing Features & Incomplete Flows

This document outlines functionality that needs to be implemented to complete the Sankha marketplace MVP and beyond. Organized by priority based on the strategic pivot to a price-comparison platform with escrow-based payments.

---

## CRITICAL - Sankha MVP Core Features

These are required for the Sankha escrow model to function properly.

### 1. Dual Pricing System (Base + Display)

**Current state:** Only one price stored per shop_product (no commission logic).

**What's needed:**
- Add `base_price` field to `shop_products` (seller's take-home amount)
- Add `base_price` field to `order_items` (freeze seller payout at purchase time)
- Update product upload flow to calculate: `display_price = base_price × 1.0526`
- Or vice versa: `base_price = display_price / 1.0526`
- Update all product display logic to show `display_price` to buyers
- Admin dashboard to monitor commission earned per order

**Schema changes:**
```prisma
model shop_products {
  // ... existing fields
  base_price    Decimal  @db.Decimal(10, 2)  // Seller's net amount
  price         Decimal  @db.Decimal(10, 2)  // Display price (includes commission)
}

model order_items {
  // ... existing fields
  base_price    Decimal  @db.Decimal(10, 2)  // Frozen at purchase time
}
```

**Affected areas:** Product controller, cart/checkout, order creation, payout calculations

---

### 2. Release Code System

**Current state:** Not implemented.

**What's needed:**
- Add release code fields to `orders` table: `release_code`, `release_code_status`, `release_code_expires_at`, `release_code_verified_at`
- Generate 6-digit alphanumeric code when order status changes to `CONFIRMED` (payment received)
- Send release code to buyer via SMS/email
- `POST /api/orders/:orderId/verify-code` endpoint for shops to verify delivery
- Update order status to `COMPLETED` on successful verification
- Trigger wallet crediting on verification
- Handle expiration (default 14 days) and auto-cancellation logic

**Schema changes:**
```prisma
model orders {
  // ... existing fields
  release_code            String?
  release_code_status     ReleaseCodeStatus @default(PENDING)
  release_code_expires_at DateTime?
  release_code_verified_at DateTime?
}

enum ReleaseCodeStatus {
  PENDING
  VERIFIED
  EXPIRED
  CANCELLED
}
```

**Service needed:** `OrderConfirmationService` (see ESCROW_TO_WALLET_DESIGN.md)

---

### 3. Shop Wallet & Transaction Ledger

**Current state:** No wallet balance tracking.

**What's needed:**
- Add `wallet_balance` field to `shops` table
- Create `transactions` table to log all wallet activity
- Credit wallet when release code is verified
- Deduct wallet on payout request
- `GET /api/shops/wallet` - View current balance
- `GET /api/shops/transactions` - Transaction history with filters

**Schema changes:**
```prisma
model shops {
  // ... existing fields
  wallet_balance  Decimal @default(0.00) @db.Decimal(10, 2)
  transactions    transactions[]
}

model transactions {
  id              String            @id @default(uuid())
  shop_id         String            @db.Uuid
  type            TransactionType
  amount          Decimal           @db.Decimal(10, 2)
  balance_before  Decimal           @db.Decimal(10, 2)
  balance_after   Decimal           @db.Decimal(10, 2)
  status          TransactionStatus @default(PENDING)
  order_id        String?           @db.Uuid
  payout_id       String?           @db.Uuid
  description     String?
  metadata        Json?
  created_at      DateTime          @default(now())
  
  shops           shops             @relation(fields: [shop_id], references: [id])
  orders          orders?           @relation(fields: [order_id], references: [id])
}

enum TransactionType {
  ORDER_CREDIT
  PAYOUT
  REFUND
  ADJUSTMENT
}

enum TransactionStatus {
  PENDING
  COMPLETED
  FAILED
  REVERSED
}
```

**Affected services:** OrderConfirmationService, PayoutService

---

### 4. Payout System (PayChangu Disbursement)

**Current state:** No way for sellers to withdraw earnings.

**What's needed:**
- Research PayChangu Disbursement/Payout API documentation
- `POST /api/shops/payout` - Request withdrawal (requires mobile money number)
- Validate sufficient wallet balance before initiating
- Call `https://api.paychangu.com/mobile-money/payouts/initialize`
- Create `PAYOUT` transaction with status `PENDING`
- Deduct amount from `wallet_balance` immediately
- Handle webhook for payout success/failure
- Refund to wallet if payout fails
- Minimum payout amount enforcement (e.g., MWK 1,000)
- Consider payout fees (deduct from seller or absorb as Sankha cost)

**Service needed:** `PayoutService`

**New endpoints:**
- `POST /api/shops/payout` - Initiate withdrawal
- `POST /api/webhooks/paychangu/disbursement` - Handle payout status updates

---

### 5. Delivery Zones & WhatsApp Contact

**Current state:** Shops specify `ships_nationwide` but no zone details.

**What's needed:**
- Add `delivery_zones` field to `shops` (array or JSONB)
- Add `whatsapp_number` field to `shops` for buyer contact
- Display "Contact Seller" button on shop pages with WhatsApp deep link
- Filter products by buyer's delivery address (match zones)
- Admin interface to manage delivery zone options

**Schema changes:**
```prisma
model shops {
  // ... existing fields
  whatsapp_number  String?
  delivery_zones   String[]  // e.g., ["Lilongwe", "Blantyre", "Mzuzu"]
}
```

**UI needs:** WhatsApp button on product/shop pages: `https://wa.me/265{whatsapp_number}`

---

### 6. Order Status Flow Updates

**Current state:** Basic status transitions exist but need refinement for escrow model.

**What's needed:**
- Add `OUT_FOR_DELIVERY` status (optional, shop self-reports)
- Prevent status changes after `COMPLETED` (immutable once verified)
- Auto-cancel orders with expired release codes
- Background job to check for expired codes daily
- Trigger refund automatically on cancellation (if paid)

**Status flow:**
```
CART → PENDING → CONFIRMED (payment received, release code generated) 
  → OUT_FOR_DELIVERY (optional) 
  → COMPLETED (release code verified, wallet credited) 
  → [CANCELLED/REFUNDED if issues]
```

---

## HIGH PRIORITY - User Experience & Trust

### 7. Shop Ranking System

**Current state:** No ranking or reputation score.

**What's needed:**
- Add `rating` and `total_reviews` fields to `shops` table
- Calculate composite `shop_score`:
  - Average rating: 40%
  - Verified status: 20%
  - Completed orders: 30% (normalize by platform average)
  - Recency: 10% (active in last 30 days)
- Update `rating` and `total_reviews` when product reviews are submitted
- Sort shops by `shop_score` on search/browse pages
- Display badge for top-rated shops

**Schema changes:**
```prisma
model shops {
  // ... existing fields
  rating        Decimal? @db.Decimal(2, 1)  // 0.0 to 5.0
  total_reviews Int      @default(0)
  shop_score    Decimal? @db.Decimal(3, 2)  // Composite score 0-100
  last_active   DateTime @default(now())
}
```

**Implementation:** Trigger or background job to recalculate scores periodically

---

### 8. Email/SMS Notification Delivery

**Current state:** Order messages created in `order_messages` table but never sent.

**What's needed:**
- Email service integration (nodemailer with SMTP, or SendGrid/Mailgun)
- SMS service for Malawi (Africa's Talking, Twilio, or local providers)
- Background job (Bull/BullMQ) to process unsent messages
- Templates for:
  - Order confirmation with release code
  - Payment successful
  - Order status updates
  - Delivery verification reminder (if code not used within X days)
  - Wallet credited notification
  - Payout success/failure

**Priority:** HIGH - critical for user trust and communication

---

### 9. Password Reset Flow

**Current state:** Not implemented.

**What's needed:**
- `POST /api/auth/forgot-password` - Send reset email
- `POST /api/auth/reset-password` - Reset with token
- Password reset token storage (Redis with TTL or database table)
- Email template for reset link
- Rate limiting on forgot-password requests

**Schema option (if not using Redis):**
```prisma
model password_resets {
  id         String   @id @default(uuid())
  user_id    String   @db.Uuid
  token      String   @unique
  expires_at DateTime
  used       Boolean  @default(false)
  created_at DateTime @default(now())
}
```

---

### 10. Refund Processing

**Current state:** `REFUNDED` status exists but no refund trigger.

**What's needed:**
- `POST /api/orders/:orderId/refund` - Initiate refund (admin or automatic)
- PayChangu refund API integration (if available)
- Refund reason tracking
- Stock restoration logic (return items to shop inventory)
- Trigger refund automatically when:
  - Order cancelled after payment
  - Release code expires without verification
  - Shop requests cancellation before shipment

**Workflow:**
1. Validate order is eligible (paid but not completed)
2. Call PayChangu refund API or manually process
3. Update order status to `REFUNDED`
4. Restore stock quantities
5. Notify buyer of refund status

---

## MEDIUM PRIORITY - Enhanced Features

### 11. Shop Verification Workflow

**Current state:** `is_verified` field exists but no verification process.

**What's needed:**
- Document upload endpoint (business registration, ID, proof of address)
- Admin dashboard to review pending verifications
- `PATCH /api/admin/shops/:id/verify` - Approve/reject
- Notification to shop owner on status change
- Display verified badge on shop pages
- Filter to show only verified shops

---

### 12. Email Verification on Signup

**Current state:** Users can register without verifying email.

**What's needed:**
- Add `email_verified`, `email_verify_token`, `email_verify_expires` to `users` table
- Send verification email on registration
- `GET /api/auth/verify-email/:token` endpoint
- Optionally restrict certain actions for unverified users

**Schema changes:**
```prisma
model users {
  // ... existing fields
  email_verified       Boolean   @default(false)
  email_verify_token   String?
  email_verify_expires DateTime?
}
```

---

### 13. Wishlist / Saved Items

**Current state:** Not implemented.

**What's needed:**
- `wishlists` table
- `POST /api/wishlist` - Add item
- `GET /api/wishlist` - Get user's saved items
- `DELETE /api/wishlist/:id` - Remove item
- Quick "Move to Cart" button

**Schema:**
```prisma
model wishlists {
  id              String        @id @default(uuid())
  user_id         String        @db.Uuid
  shop_product_id String        @db.Uuid
  created_at      DateTime      @default(now())
  
  users           users         @relation(fields: [user_id], references: [id])
  shop_products   shop_products @relation(fields: [shop_product_id], references: [id])
  
  @@unique([user_id, shop_product_id])
}
```

---

### 14. Low Stock Alerts

**Current state:** Stock tracked but no alerts.

**What's needed:**
- Add `low_stock_threshold` to `shop_products`
- Background job to check stock levels
- Email/SMS notification to shop owners
- Admin dashboard showing out-of-stock products platform-wide

---

### 15. Change Password (Logged In)

**Current state:** Not implemented.

**What's needed:**
- `PATCH /api/users/password` endpoint
- Requires current password + new password validation
- Invalidate all existing refresh tokens after change (force re-login)

---

### 16. Analytics & Reporting

**Current state:** Basic `getOrderStats` for admins only.

**What's needed:**
- **Seller dashboard:**
  - Sales over time (daily/weekly/monthly)
  - Top-selling products
  - Wallet balance history
  - Order completion rate
  - Average delivery time (from confirmed to completed)
- **Admin dashboard:**
  - Total GMV (Gross Merchandise Value)
  - Commission earned
  - Active shops vs total shops
  - Platform-wide order metrics
  - Top-performing shops
- Export functionality (CSV/PDF)

---

## LOWER PRIORITY - Advanced Features

### 17. Product Return Flow

**Current state:** Not implemented.

**What's needed:**
- `returns` table
- `POST /api/orders/:orderId/items/:itemId/return` - Request return
- Return approval workflow for sellers
- Integration with refund flow
- Return shipping coordination (buyer responsibility in Sankha model)

**Schema:**
```prisma
model returns {
  id            String        @id @default(uuid())
  order_item_id String        @db.Uuid
  reason        String
  status        ReturnStatus  @default(PENDING)
  created_at    DateTime      @default(now())
  updated_at    DateTime      @default(now())
}

enum ReturnStatus {
  PENDING
  APPROVED
  REJECTED
  COMPLETED
}
```

---

### 18. Location-Based Search

**Current state:** Shops have lat/lng but no proximity search.

**What's needed:**
- PostGIS extension or Haversine formula in query
- `GET /api/shops?lat=-13.9833&lng=33.7833&radius=10km`
- Sort products by shop distance
- Filter by delivery zones matching buyer location

---

### 19. Price History & Alerts

**Current state:** No price tracking.

**What's needed:**
- `price_history` table to log price changes
- Track price fluctuations over time
- Allow users to set price alerts ("notify me when below MWK X")
- Display price trend graphs on product pages

---

### 20. Bulk Product Upload

**Current state:** Products added one at a time via API.

**What's needed:**
- CSV/Excel upload endpoint for shop owners
- Template download for bulk upload format
- Background job to process and validate rows
- Error reporting for invalid entries

---

## Implementation Roadmap

### Phase 1: Sankha MVP (CRITICAL)
1. Dual pricing system (base_price + display_price)
2. Release code generation and verification
3. Shop wallet & transaction ledger
4. Payout system with PayChangu Disbursement
5. Delivery zones & WhatsApp contact
6. Order status flow refinements

### Phase 2: Trust & Communication (HIGH)
7. Shop ranking system
8. Email/SMS notification delivery
9. Password reset flow
10. Refund processing automation

### Phase 3: Enhanced UX (MEDIUM)
11. Shop verification workflow
12. Email verification on signup
13. Wishlist functionality
14. Low stock alerts
15. Change password feature
16. Analytics dashboards

### Phase 4: Advanced Features (LOWER)
17. Product returns
18. Location-based search
19. Price history tracking
20. Bulk product upload

---

## Business Decisions Required

Before implementing Phase 1, these decisions must be finalized (see SANKHA_MVP_DECISIONS.md and ESCROW_TO_WALLET_DESIGN.md):

1. Commission calculation method (5% vs 5.26% markup)
2. Transaction ledger structure (single vs split entries)
3. Minimum payout amount and payout fee handling
4. Release code expiry period
5. Multi-shop checkout strategy (split into separate orders vs unified)
6. Notification preferences (email vs SMS priority)
