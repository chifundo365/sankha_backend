# Missing Features & Incomplete Flows

This document outlines functionality that exists in the database schema or is referenced in code but hasn't been fully implemented yet.

---

## High Priority

### 1. Email/Notification Delivery

**Current state:** Order messages are created in the `order_messages` table but never sent.

**What's needed:**
- Email service integration (nodemailer, SendGrid, or similar)
- SMS integration for Malawi (consider Africa's Talking or local providers)
- Background job to process unsent messages
- Templates for order confirmations, status updates, cancellations

**Affected areas:**
- Order status changes create messages with `is_sent: false`
- Cancellation notifications
- Payment confirmations

---

### 2. Password Reset Flow

**Current state:** Not implemented.

**What's needed:**
- `POST /api/auth/forgot-password` - Send reset email
- `POST /api/auth/reset-password` - Reset with token
- Password reset token storage (could use Redis with TTL)
- Email template for reset link

---

### 3. Refund Processing

**Current state:** `REFUNDED` status exists in schema but no endpoint to trigger it.

**What's needed:**
- `POST /api/orders/:orderId/refund` - Initiate refund (admin)
- PayChangu refund API integration
- Refund reason tracking
- Stock restoration logic (if product returned)

---

## Medium Priority

### 4. Email Verification on Signup

**Current state:** Users can register without verifying email.

**What's needed:**
- Add `email_verified` field to users table
- Send verification email on registration
- `GET /api/auth/verify-email/:token` endpoint
- Restrict certain actions for unverified users (optional)

---

### 5. Wishlist / Saved Items

**Current state:** Mentioned in docs but not implemented.

**What's needed:**
- `wishlists` table: `id`, `user_id`, `shop_product_id`, `created_at`
- `POST /api/wishlist` - Add item
- `GET /api/wishlist` - Get user's wishlist
- `DELETE /api/wishlist/:id` - Remove item
- Move to cart functionality

---

### 6. Shop Verification Workflow

**Current state:** `is_verified` field exists but no way to verify shops.

**What's needed:**
- Document upload endpoint for business registration
- Admin endpoint to review pending shops
- `PATCH /api/admin/shops/:id/verify` - Approve/reject
- Notification to shop owner on status change

---

### 7. Low Stock Alerts

**Current state:** Stock is tracked but no alerts.

**What's needed:**
- `low_stock_threshold` field on `shop_products`
- Background job to check stock levels
- Notification to shop owners when stock falls below threshold
- Admin dashboard for out-of-stock products

---

## Lower Priority

### 8. Seller Payout System

**Current state:** `payout_status` enum exists but no payout tracking.

**What's needed:**
- `payouts` table: tracks amounts owed to shops
- Calculate shop earnings from completed orders
- `POST /api/admin/payouts` - Initiate payout
- Payout history for sellers

---

### 9. Change Password (Logged In)

**Current state:** Not implemented.

**What's needed:**
- `PATCH /api/users/password` 
- Requires current password + new password
- Invalidate existing refresh tokens after change

---

### 10. Product Return Flow

**Current state:** Not implemented.

**What's needed:**
- `returns` table: `id`, `order_item_id`, `reason`, `status`, `created_at`
- `POST /api/orders/:orderId/items/:itemId/return` - Request return
- Return approval workflow for sellers
- Integration with refund flow

---

### 11. Location-Based Search

**Current state:** Shops have lat/lng but no proximity search.

**What's needed:**
- PostGIS extension or calculate distance in query
- `GET /api/shops?lat=X&lng=Y&radius=10km`
- Sort by distance option

---

### 12. Analytics & Reporting

**Current state:** Basic `getOrderStats` for admins only.

**What's needed:**
- Seller dashboard: sales, top products, revenue over time
- Admin dashboard: platform-wide metrics
- Export functionality (CSV/PDF)

---

## Database Changes Required

Some features need schema updates:

```prisma
// For email verification
model users {
  // ... existing fields
  email_verified    Boolean   @default(false)
  email_verify_token String?
  email_verify_expires DateTime?
}

// For password reset
model password_resets {
  id         String   @id @default(uuid())
  user_id    String   @db.Uuid
  token      String   @unique
  expires_at DateTime
  used       Boolean  @default(false)
  created_at DateTime @default(now())
}

// For wishlist
model wishlists {
  id              String        @id @default(uuid())
  user_id         String        @db.Uuid
  shop_product_id String        @db.Uuid
  created_at      DateTime      @default(now())
  users           users         @relation(...)
  shop_products   shop_products @relation(...)
  
  @@unique([user_id, shop_product_id])
}

// For returns
model returns {
  id            String   @id @default(uuid())
  order_item_id String   @db.Uuid
  reason        String
  status        return_status @default(PENDING)
  created_at    DateTime @default(now())
  updated_at    DateTime @default(now())
}

enum return_status {
  PENDING
  APPROVED
  REJECTED
  COMPLETED
}
```

---

## Implementation Order Recommendation

1. **Email service** - Unblocks notifications for everything else
2. **Password reset** - Basic user expectation
3. **Refunds** - Required for complete order lifecycle
4. **Email verification** - Security improvement
5. **Wishlist** - User engagement feature
6. **Shop verification** - Trust & safety
7. **Everything else** - Based on business priorities
