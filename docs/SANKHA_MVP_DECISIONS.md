# Sankha MVP - Technical Decisions Required

This document captures the strategic pivot and technical questions that need answers before implementing the escrow/delivery code system.

---

## The Sankha Model (Aligned)

| Aspect | Decision |
|--------|----------|
| **Identity** | Trust layer / price-comparison platform, NOT a logistics company |
| **Delivery** | Shops handle their own deliveries |
| **Revenue** | 5% markup on seller's base price (3% PayChangu fee + 2% Sankha commission) |
| **Escrow** | Funds held until buyer provides Release Code to delivery person |
| **MVP Focus** | Features that build trust and facilitate "Choose → Pay → Self-Deliver" flow |

---

## Questions Requiring Business Decisions

### 1. Pricing Storage Strategy

**Question:** Should we store `base_price` (what seller wants) and `display_price` (buyer sees) separately, or calculate the 5% on-the-fly?

**Options:**
- **A) Store both prices** — `base_price` = seller's price, `display_price` = base × 1.05
- **B) Calculate on-the-fly** — Store only `base_price`, multiply by 1.05 in API responses

**Recommendation:** Option A — makes SQL sorting/filtering by price work correctly, avoids floating-point rounding issues.

**Decision:** _________________

---

### 2. The Commission Math Problem

The current 5% markup has a gap:

```
Seller wants:           MK 100,000
Display price (×1.05):  MK 105,000
PayChangu fee (3%):     MK 3,150
Sankha cut (2%):        MK 2,100
─────────────────────────────────
Seller receives:        MK 99,750  ← SHORT BY MK 250
```

**Options:**
- **A) Accept ~0.25% loss to seller** — Simpler, seller gets slightly less than requested
- **B) Use higher markup (5.26%)** — Ensures seller gets exactly their requested amount
- **C) Calculate commission on base price** — Sankha takes 2% of 100k, not 105k

**Math for Option B:**
```
To ensure seller gets exactly MK 100,000:
Display = Base ÷ (1 - 0.05) = Base × 1.0526
Display = 100,000 × 1.0526 = MK 105,260
PayChangu (3%): MK 3,158
Sankha (2%): MK 2,105
Seller gets: MK 99,997 ≈ MK 100,000 ✓
```

**Decision:** _________________

---

### 3. Release Code Lifecycle

**Questions to answer:**

| Question | Options |
|----------|---------|
| When is code generated? | A) At checkout, B) When shop marks "dispatched", C) When payment confirmed |
| Who sees the code? | A) Buyer only, B) Buyer + in order details |
| How is code delivered to buyer? | A) SMS, B) In-app only, C) Both |
| Code format? | A) 4 digits, B) 6 digits, C) Alphanumeric |
| Code expiry? | A) 24 hours, B) 48 hours, C) 72 hours, D) Never |
| What if buyer refuses delivery? | A) Buyer raises dispute, B) Auto-refund after X days |

**Proposed Flow:**
```
Checkout → Payment HELD → Order CONFIRMED
                              ↓
              Shop marks OUT_FOR_DELIVERY
                              ↓
              Release Code generated → Sent to buyer (SMS?)
                              ↓
                      Delivery happens
                              ↓
              Shop enters code in dashboard
                              ↓
              Code matches → DELIVERED → Funds released
```

**Decision:** _________________

---

### 4. Multi-Shop Checkout & Escrow

Current system creates separate orders per shop from one checkout.

**Question:** Should each shop-order have its own PayChangu transaction, or one combined payment split later?

**Options:**
- **A) Separate payments per shop**
  - Pros: Cleaner escrow, each Release Code unlocks one shop's funds independently
  - Cons: Buyer sees multiple charges on their statement

- **B) Single combined payment**
  - Pros: Better buyer UX, one transaction
  - Cons: Requires "Sankha holding account" and manual disbursement logic

**Recommendation:** Option A — simpler escrow model, each shop's transaction is isolated.

**Decision:** _________________

---

### 5. Seller Wallet & Payout Flow

After Release Code is confirmed, where do funds go?

**Options:**
- **A) Direct payout** — Immediately to seller's mobile money via PayChangu
- **B) Wallet balance** — Accumulates in `shops.wallet_balance`, seller withdraws on demand
- **C) Batched payouts** — Daily/weekly automatic transfers to reduce fees

**Considerations:**
- Option A: Simplest, but each payout may have fees
- Option B: Requires wallet ledger (`transactions` table), withdrawal endpoint
- Option C: Best for reducing fees, but sellers wait longer for money

**Decision:** _________________

---

### 6. Order Status Flow Update

Current statuses don't fully reflect seller-led delivery model.

**Proposed status additions/changes:**

| Current | Proposed | Notes |
|---------|----------|-------|
| `READY_FOR_PICKUP` | Keep or rename to `READY` | Ambiguous for delivery |
| — | Add `OUT_FOR_DELIVERY` | Shop has dispatched |
| — | Add `AWAITING_CODE` | Delivered, waiting for code entry |
| `DELIVERED` | Keep | Code verified, funds released |

**Decision:** _________________

---

## Schema Changes (Pending Decisions)

Once decisions are made, implement these changes:

```prisma
// shop_products - dual pricing
model shop_products {
  base_price      Decimal   @db.Decimal(10, 2)  // What seller wants
  display_price   Decimal   @db.Decimal(10, 2)  // base_price × markup
  // ... existing fields
}

// orders - release code
model orders {
  release_code           String?   @db.VarChar(6)
  release_code_status    release_code_status?
  release_code_generated DateTime?
  release_code_expires   DateTime?
  release_code_verified  DateTime?
  // ... existing fields
}

enum release_code_status {
  PENDING      // Code generated, waiting for delivery
  VERIFIED     // Shop entered correct code
  EXPIRED      // Time limit passed
  DISPUTED     // Buyer raised issue
}

// shops - wallet & delivery config
model shops {
  wallet_balance    Decimal   @default(0) @db.Decimal(10, 2)
  whatsapp_number   String?   @db.VarChar(20)
  delivery_zones    Json?     // [{ area: "Lilongwe", fee: 2500 }, ...]
  // ... existing fields
}

// New: transaction ledger for wallet
model transactions {
  id              String             @id @default(uuid())
  shop_id         String             @db.Uuid
  order_id        String?            @db.Uuid
  type            transaction_type
  amount          Decimal            @db.Decimal(10, 2)
  fee             Decimal?           @db.Decimal(10, 2)
  description     String?
  status          transaction_status @default(COMPLETED)
  created_at      DateTime           @default(now())
  
  shop            shops              @relation(fields: [shop_id], references: [id])
  order           orders?            @relation(fields: [order_id], references: [id])
}

enum transaction_type {
  ORDER_CREDIT     // Funds from completed order
  COMMISSION       // Sankha's cut (negative)
  PAYOUT           // Withdrawal to mobile money
  REFUND           // Money returned to buyer
  ADJUSTMENT       // Manual correction
}

enum transaction_status {
  PENDING
  COMPLETED
  FAILED
}
```

---

## Implementation Priority

Once decisions are finalized:

| Priority | Feature | Effort | Dependency |
|----------|---------|--------|------------|
| 1 | Dual pricing (base + display) | Low | Decision #1, #2 |
| 2 | Release Code generation & verification | Medium | Decision #3 |
| 3 | Order status flow update | Low | Decision #6 |
| 4 | Seller delivery zones | Low | None |
| 5 | WhatsApp button | Very Low | None |
| 6 | Admin refund trigger | Low | None |
| 7 | Seller wallet & transactions | High | Decision #5 |
| 8 | Payout endpoint | Medium | Decision #5 |

---

## MVP Cut List

Features to delay until post-MVP:

- Advanced analytics dashboards
- Wishlist functionality
- Email marketing automation
- Automated dispute resolution (admin handles manually)
- Shop verification document upload (manual verification first)
- Low stock alerts
- Push notifications

---

## Next Steps

1. **Fill in decisions above**
2. **Review with team/stakeholders**
3. **Begin implementation in priority order**
4. **Test escrow flow end-to-end before launch**
