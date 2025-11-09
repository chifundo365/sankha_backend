# Seed File Update Summary

## Date: 2025
## Purpose: Align seed.ts with GitHub migration schema

## Changes Made

### 1. Migration File Updated (migration.sql)
- ✅ Replaced with complete GitHub version (316 lines)
- ✅ Added `stock_change_type` enum (INCREASE, DECREASE, ADJUSTMENT)
- ✅ Added `sku` field to `shop_products` table (VARCHAR(50))
- ✅ Added `channel` field to `order_messages` table (message_channel enum, DEFAULT 'EMAIL')
- ✅ Added `reason` field to `shop_products_log` table (VARCHAR(100))
- ✅ Changed `total_price` in `order_items` to GENERATED ALWAYS AS ("quantity" * "unit_price") STORED
- ✅ Added all CHECK constraints with proper names
- ✅ Added triggers for auto-updating `updated_at` timestamps
- ✅ Added `update_updated_at_column()` function

### 2. Seed File Updated (seed.ts)

#### Shop Products Section
- ✅ Added `sku` field to all 5 shop_products:
  - "TECH-IP15PM-256-TI" (iPhone at TechHub)
  - "DW-MBA-M3-256-SG" (MacBook at Digital World)
  - "GP-SONY-1000XM5-BLK" (Sony headphones at Gadget Palace)
  - "GZ-PS5-STD-WHT" (PS5 at GameZone)
  - "ST-ECHO-DOT5-BLK" (Echo Dot at SmartTech)

#### Order Messages Section
- ✅ Added `channel` field to all 5 order_messages:
  - "EMAIL" (Order confirmation)
  - "EMAIL" (New order to shop)
  - "SMS" (Order preparing notification)
  - "PUSH_NOTIFICATION" (Order shipped notification)
  - "EMAIL" (Order delivered confirmation)

#### Shop Products Log Section
- ✅ Added `reason` field to all 5 shop_products_log entries:
  - "Customer purchase - Order ORD-2024-001"
  - "Inventory restock from supplier"
  - "Customer purchase - Bulk order"
  - "Customer purchase - Order ORD-2024-004"
  - "New stock arrival from Amazon"

### 3. Order Items Section
- ✅ Verified `total_price` is NOT manually set (auto-computed by database)
- ✅ Database will automatically calculate: total_price = quantity * unit_price

## Database Schema Enums

### message_channel Enum Values
- EMAIL
- SMS
- PUSH_NOTIFICATION
- IN_APP

### stock_change_type Enum Values
- INCREASE
- DECREASE
- ADJUSTMENT

## Testing Instructions

Once database connectivity is restored:

```bash
# Reset database and run migrations
npx prisma migrate reset --force

# Or just push schema changes
npx prisma db push

# Run seed script
npm run seed
```

## Expected Results

The seed script should successfully create:
- 5 users (1 Admin, 2 Sellers, 2 Users)
- 5 categories
- 5 products
- 5 shops across Malawi
- 5 user addresses
- 5 shop_products with SKUs
- 5 orders
- 5 order_items with auto-computed total_price
- 5 payments
- 5 reviews
- 5 order_messages with channels
- 5 shop_products_log with reasons

**Total: 60 rows across 12 tables**

## Important Notes

1. **total_price is GENERATED**: Do NOT manually set `total_price` in `order_items` - it's automatically computed by PostgreSQL
2. **New required fields**: All new insertions must include:
   - `sku` for shop_products
   - `channel` for order_messages (defaults to EMAIL if not specified)
   - `reason` for shop_products_log (optional but recommended)
3. **Enum values**: Use proper enum values for `stock_change_type` (INCREASE, DECREASE, ADJUSTMENT)

## Validation Checklist

- ✅ TypeScript compilation: No errors
- ✅ Prisma schema aligned with migration
- ✅ All new fields added to seed data
- ✅ GENERATED column not manually set
- ⏳ Database connectivity (currently down)
- ⏳ Seed execution (pending DB connection)

## Next Steps

1. Wait for database connectivity to be restored
2. Run `npx prisma db push` or `npx prisma migrate reset`
3. Execute seed script with `npm run seed`
4. Verify all 60 rows are created successfully
5. Test that `total_price` is auto-computed correctly
6. Validate all new fields are populated
