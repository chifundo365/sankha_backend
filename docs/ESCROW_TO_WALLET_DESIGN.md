# Escrow to Wallet Flow — Design Document

This document outlines the logic for the **OrderConfirmationService** that handles fund transfer from "Escrow" (PayChangu holding) to "Shop Wallet" upon release code verification.

---

## Overview

With PayChangu's Disbursement/Payout API (fixed small fee), we're implementing:

| Component | Description |
|-----------|-------------|
| **Wallet Table** | `shops.wallet_balance` credited when release code verified |
| **Payout Integration** | Service to hit PayChangu's `/mobile-money/payouts/initialize` endpoint |
| **Withdrawal Endpoint** | `POST /api/shops/payout` for shop owners to request payouts |
| **Transaction Ledger** | `transactions` table with `type: PAYOUT` for audit trail |

---

## The Flow: Release Code Verified → Shop Wallet Credited

```
┌─────────────────────────────────────────────────────────────────┐
│                    RELEASE CODE VERIFICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Shop enters release code (from their dashboard)             │
│                    ↓                                            │
│  2. System validates: code matches + not expired + not used     │
│                    ↓                                            │
│  3. Mark order as DELIVERED                                     │
│                    ↓                                            │
│  4. Calculate seller payout:                                    │
│     ┌──────────────────────────────────────────────────┐        │
│     │ order.total_amount (what buyer paid)             │        │
│     │ - PayChangu fee (3% already deducted at source)  │        │
│     │ - Sankha commission (2% of display price)        │        │
│     │ = seller_payout                                  │        │
│     └──────────────────────────────────────────────────┘        │
│                    ↓                                            │
│  5. Credit shop.wallet_balance += seller_payout                 │
│                    ↓                                            │
│  6. Create transaction record (type: ORDER_CREDIT)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Questions

### Q1: Where Does the "Escrow" Actually Live?

PayChangu holds the money after checkout. When we say "escrow," it's really:

- **PayChangu's account** holds the funds (they've processed the payment)
- We're just **delaying our acknowledgment** until the release code is verified

So the "transfer to wallet" is actually:
- An **accounting entry** in our system (increment `wallet_balance`)
- The actual money is still with PayChangu until the seller requests a **payout**

**Implication:** The `wallet_balance` is a "virtual" balance representing what Sankha owes the seller.

```
┌────────────────────────────────────────────────────────────────┐
│                        MONEY FLOW                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   BUYER                    PAYCHANGU                SELLER     │
│     │                          │                       │       │
│     │──── Pays MK 105,260 ────>│                       │       │
│     │                          │                       │       │
│     │                    [HOLDS FUNDS]                 │       │
│     │                          │                       │       │
│     │                          │    (Release Code      │       │
│     │                          │     Verified)         │       │
│     │                          │                       │       │
│     │                    ┌─────┴─────┐                 │       │
│     │                    │  SANKHA   │                 │       │
│     │                    │  SYSTEM   │                 │       │
│     │                    └─────┬─────┘                 │       │
│     │                          │                       │       │
│     │                   Credits wallet_balance         │       │
│     │                   (MK 100,000)                   │       │
│     │                          │                       │       │
│     │                          │    (Seller requests   │       │
│     │                          │     payout)           │       │
│     │                          │                       │       │
│     │                          │── Disbursement API ──>│       │
│     │                          │   (MK 100,000 - fee)  │       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### Q2: The Math — Who Pays What?

Using the 5.26% markup decision:

```
Seller's base_price:        MK 100,000
Display price (×1.0526):    MK 105,260  ← Buyer pays this
─────────────────────────────────────────
PayChangu fee (3%):         MK 3,158    ← Deducted at payment time
Sankha commission (2%):     MK 2,105    ← We keep this
─────────────────────────────────────────
Seller receives:            MK 100,000  ← This goes to wallet_balance
```

**Service logic:**

```typescript
// Option A: Reverse calculate from display price
const displayPrice = order.total_amount;  // What buyer paid
const sellerPayout = displayPrice / 1.0526;  // Back to base price

// Option B: Sum base prices from order_items (RECOMMENDED)
const sellerPayout = order.order_items.reduce(
  (sum, item) => sum + (item.base_price * item.quantity), 
  0
);
```

**Recommendation:** Store `base_price` on `order_items` at checkout time for easier calculations — no reverse-calculation needed.

---

### Q3: Transaction Ledger Entries

When release code is verified, create **one** transaction:

| Field | Value |
|-------|-------|
| `shop_id` | The shop receiving funds |
| `order_id` | Link to the order |
| `type` | `ORDER_CREDIT` |
| `amount` | Seller's payout (base price total) |
| `fee` | `null` (no fee on credit) |
| `description` | `"Order #ORD-123456 delivered"` |
| `status` | `COMPLETED` |

**Alternative: Split into two entries** (clearer audit trail, more complexity):
1. Gross amount received (positive)
2. Commission deducted (negative)

---

### Q4: Multi-Item Order Calculation

If an order has 3 items from the same shop:

```
Item 1: base_price MK 50,000 × qty 1 = MK 50,000
Item 2: base_price MK 30,000 × qty 1 = MK 30,000  
Item 3: base_price MK 20,000 × qty 1 = MK 20,000
───────────────────────────────────────────────────
Total base: MK 100,000 → This goes to wallet
```

The service should sum up base prices from `order_items`, not reverse-calculate from `total_amount`.

---

### Q5: Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Code already verified | Reject, return "already delivered" |
| Code expired | Reject, prompt buyer to contact support |
| Order already cancelled/refunded | Reject, "order not eligible" |
| Shop doesn't exist anymore | Should never happen (FK constraint), but log error |
| Database transaction fails | Rollback everything, don't partial-credit |

---

## Proposed Service Interface

```typescript
// src/services/orderConfirmation.service.ts

interface ReleaseCodeVerificationResult {
  success: boolean;
  message: string;
  order?: {
    id: string;
    order_number: string;
    status: string;
  };
  walletCredit?: {
    amount: number;
    newBalance: number;
    transactionId: string;
  };
}

class OrderConfirmationService {
  
  /**
   * Verify release code and credit shop wallet
   * Called when shop enters the code from their dashboard
   */
  async verifyReleaseCode(
    orderId: string, 
    code: string, 
    shopId: string  // Verify shop owns this order
  ): Promise<ReleaseCodeVerificationResult>
  
  /**
   * Calculate what the seller should receive
   * Based on sum of base_price × quantity from order_items
   */
  private calculateSellerPayout(order: OrderWithItems): Decimal
  
  /**
   * Credit the shop's wallet and create transaction record
   * Uses database transaction for atomicity
   */
  private creditShopWallet(
    shopId: string, 
    amount: Decimal, 
    orderId: string
  ): Promise<Transaction>
}
```

---

## Full Verification Flow (Pseudocode)

```typescript
async verifyReleaseCode(orderId: string, code: string, shopId: string) {
  // 1. Fetch order with items
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: { order_items: true }
  });

  // 2. Validate order exists and belongs to shop
  if (!order) throw new Error('Order not found');
  if (order.shop_id !== shopId) throw new Error('Unauthorized');

  // 3. Check order status is eligible
  if (order.status === 'DELIVERED') {
    return { success: false, message: 'Order already delivered' };
  }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    return { success: false, message: 'Order not eligible for delivery' };
  }

  // 4. Validate release code
  if (order.release_code !== code) {
    return { success: false, message: 'Invalid release code' };
  }
  if (order.release_code_expires && order.release_code_expires < new Date()) {
    return { success: false, message: 'Release code has expired' };
  }

  // 5. Calculate seller payout (sum of base prices)
  const sellerPayout = order.order_items.reduce(
    (sum, item) => sum.add(item.base_price.mul(item.quantity)),
    new Decimal(0)
  );

  // 6. Execute in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update order status
    const updatedOrder = await tx.orders.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        release_code_status: 'VERIFIED',
        release_code_verified: new Date(),
        updated_at: new Date()
      }
    });

    // Credit shop wallet
    const shop = await tx.shops.update({
      where: { id: shopId },
      data: {
        wallet_balance: { increment: sellerPayout }
      }
    });

    // Create transaction record
    const transaction = await tx.transactions.create({
      data: {
        shop_id: shopId,
        order_id: orderId,
        type: 'ORDER_CREDIT',
        amount: sellerPayout,
        description: `Order #${order.order_number} delivered`,
        status: 'COMPLETED'
      }
    });

    return { updatedOrder, shop, transaction };
  });

  return {
    success: true,
    message: 'Delivery confirmed, funds credited to wallet',
    order: {
      id: result.updatedOrder.id,
      order_number: result.updatedOrder.order_number,
      status: result.updatedOrder.status
    },
    walletCredit: {
      amount: sellerPayout.toNumber(),
      newBalance: result.shop.wallet_balance.toNumber(),
      transactionId: result.transaction.id
    }
  };
}
```

---

## Payout Flow (Shop Withdraws from Wallet)

```
┌────────────────────────────────────────────────────────────────┐
│                        PAYOUT FLOW                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. Seller requests payout from dashboard                      │
│     POST /api/shops/payout                                     │
│     { amount: 100000, mobile_number: "0999123456" }            │
│                    ↓                                           │
│  2. Validate:                                                  │
│     - Amount <= wallet_balance                                 │
│     - Amount >= minimum payout (e.g., MK 5,000)                │
│     - Mobile number is valid Airtel/TNM format                 │
│                    ↓                                           │
│  3. Create PENDING transaction record                          │
│                    ↓                                           │
│  4. Deduct from wallet_balance                                 │
│                    ↓                                           │
│  5. Call PayChangu Disbursement API                            │
│     POST https://api.paychangu.com/mobile-money/payouts/initialize
│                    ↓                                           │
│  6a. SUCCESS: Update transaction status to COMPLETED           │
│  6b. FAILURE: Refund wallet_balance, mark transaction FAILED   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders/:id/verify-code` | POST | Shop verifies release code |
| `/api/shops/payout` | POST | Shop requests wallet withdrawal |
| `/api/shops/wallet` | GET | Get wallet balance & recent transactions |
| `/api/shops/transactions` | GET | Full transaction history |

---

## Open Questions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Single vs split transaction entries | One `ORDER_CREDIT` entry OR separate gross + commission | _______ |
| 2 | Store base_price on order_items? | Yes (recommended) / No (reverse calculate) | _______ |
| 3 | Notification on wallet credit? | SMS / Email / In-app / None | _______ |
| 4 | Minimum payout amount? | MK 1,000 / MK 5,000 / No minimum | _______ |
| 5 | Payout fee handling? | Deduct from amount / Add to amount / Sankha absorbs | _______ |

---

## Schema Changes Required

```prisma
// Add to order_items
model order_items {
  base_price      Decimal        @db.Decimal(10, 2)  // Seller's price at checkout
  // ... existing fields
}

// Add to shops
model shops {
  wallet_balance    Decimal   @default(0) @db.Decimal(10, 2)
  payout_mobile     String?   @db.VarChar(20)  // Registered payout number
  // ... existing fields
}

// Add to orders
model orders {
  release_code           String?   @db.VarChar(6)
  release_code_status    release_code_status?
  release_code_generated DateTime?
  release_code_expires   DateTime?
  release_code_verified  DateTime?
  // ... existing fields
}

// New transactions table
model transactions {
  id              String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  shop_id         String             @db.Uuid
  order_id        String?            @db.Uuid
  type            transaction_type
  amount          Decimal            @db.Decimal(10, 2)
  fee             Decimal?           @db.Decimal(10, 2)
  reference       String?            @db.VarChar(255)  // PayChangu payout reference
  description     String?
  status          transaction_status @default(PENDING)
  created_at      DateTime           @default(now()) @db.Timestamp(6)
  
  shop            shops              @relation(fields: [shop_id], references: [id])
  order           orders?            @relation(fields: [order_id], references: [id])
}

enum transaction_type {
  ORDER_CREDIT
  PAYOUT
  REFUND
  ADJUSTMENT
}

enum transaction_status {
  PENDING
  COMPLETED
  FAILED
}

enum release_code_status {
  PENDING
  VERIFIED
  EXPIRED
  DISPUTED
}
```

---

## Next Steps

1. **Answer open questions above**
2. **Update Prisma schema with new fields**
3. **Implement OrderConfirmationService**
4. **Implement PayoutService for PayChangu disbursements**
5. **Add endpoints to routes**
6. **Test end-to-end flow**
