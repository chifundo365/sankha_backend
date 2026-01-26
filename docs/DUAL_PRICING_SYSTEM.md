# Dual Pricing System

This document explains how Sankha handles pricing with commission built into the display price.

---

## Overview

Sellers set their **base price** (what they want to receive). The system automatically calculates the **display price** (what buyers pay) by adding a 5.26% markup to cover fees.

```
display_price = base_price × 1.0526
```

---

## Fee Breakdown

| Fee | Percentage | Purpose |
|-----|------------|---------|
| PayChangu | 3% | Payment gateway processing |
| Sankha | 2% | Platform commission |
| **Total** | **5.26%** | Markup on base price |

**Why 5.26% and not 5%?**

To ensure the seller receives exactly their base price after fees are deducted from the display price:

```
If seller wants MWK 100,000:
  display_price = 100,000 × 1.0526 = MWK 105,260

Buyer pays: MWK 105,260
  - PayChangu fee (3%): MWK 3,158
  - Sankha commission (2%): MWK 2,102
  = Seller receives: MWK 100,000 ✓
```

---

## Database Fields

### shop_products table

| Field | Type | Description |
|-------|------|-------------|
| `base_price` | Decimal(10,2) | Seller's desired take-home amount |
| `price` | Decimal(10,2) | Display price shown to buyers (calculated) |

### order_items table

| Field | Type | Description |
|-------|------|-------------|
| `unit_price` | Decimal(10,2) | Display price at time of purchase |
| `base_price` | Decimal(10,2) | Seller's payout amount (frozen at purchase) |

---

## API Changes

### Create Shop Product

**Endpoint:** `POST /api/shops/:shopId/products`

**Request:**
```json
{
  "product_id": "uuid",
  "base_price": 100000,
  "stock_quantity": 10,
  "condition": "NEW"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "base_price": "100000.00",
    "price": "105260.00",
    "stock_quantity": 10,
    "pricing_info": {
      "base_price": "100000.00",
      "display_price": "105260.00",
      "markup_percentage": "5.26%",
      "breakdown": {
        "paychangu_fee": "3%",
        "sankha_commission": "2%"
      }
    }
  }
}
```

### Update Shop Product

**Endpoint:** `PUT /api/shops/:shopId/products/:shopProductId`

**Request:**
```json
{
  "base_price": 120000
}
```

Display price is automatically recalculated when base_price changes.

---

## Code Location

| File | Purpose |
|------|---------|
| `src/schemas/shop-product.schema.ts` | Validation (expects `base_price`) |
| `src/controllers/shop-product.controller.ts` | Price calculation logic |

### Key Functions

```typescript
// Markup constant
const PRICE_MARKUP_MULTIPLIER = 1.0526;

// Calculate display price from base price
const calculateDisplayPrice = (basePrice: number): number => {
  return Math.round(basePrice * PRICE_MARKUP_MULTIPLIER * 100) / 100;
};
```

---

## Migration Notes

Existing `shop_products` rows were migrated with:

```sql
-- Set base_price to original price
-- Recalculate display price with markup
UPDATE shop_products 
SET base_price = price, 
    price = ROUND(price * 1.0526, 2);
```

This ensures sellers keep their original intended price as their base (payout) amount.

---

## Order Flow Integration

When a buyer checks out:

1. `order_items.unit_price` = `shop_products.price` (display price)
2. `order_items.base_price` = `shop_products.base_price` (frozen for payout)

When release code is verified:

1. Sum all `order_items.base_price × quantity` for the order
2. Credit that amount to `shops.wallet_balance`

---

## Example Scenarios

### Scenario 1: Single Item Purchase

| Step | Amount |
|------|--------|
| Seller sets base_price | MWK 50,000 |
| Display price (× 1.0526) | MWK 52,630 |
| Buyer pays | MWK 52,630 |
| Release code verified | — |
| Seller wallet credited | MWK 50,000 |

### Scenario 2: Multiple Items

| Item | Base Price | Qty | Buyer Pays | Seller Gets |
|------|------------|-----|------------|-------------|
| Phone | 100,000 | 1 | 105,260 | 100,000 |
| Case | 5,000 | 2 | 10,526 | 10,000 |
| **Total** | — | — | **115,786** | **110,000** |

---

## Future Considerations

1. **Variable commission rates** — Could vary by category or seller tier
2. **Promotional pricing** — Seller discounts from base_price
3. **Bulk discounts** — Reduced markup for high-volume sellers
4. **Currency rounding** — Currently rounds to 2 decimal places
