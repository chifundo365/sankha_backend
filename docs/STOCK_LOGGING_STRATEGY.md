# Stock Change Logging Strategy

## Overview
With the database trigger in place, ALL stock changes are automatically logged to `shop_products_log`.

## Important Notes

### Current Behavior:
- ✅ Database trigger logs ALL stock changes automatically
- ⚠️ Application code ALSO creates log entries with custom reasons
- ❌ This creates **DUPLICATE** log entries

### Two Options:

#### Option 1: Remove Application-Level Logging (Recommended)
**Remove these log creation blocks from controllers:**
- `shop-product.controller.ts` → `updateStock()` 
- `shop-product.controller.ts` → `addProductToShop()`
- `shop-product.controller.ts` → `updateShopProduct()`
- Keep in `order.controller.ts` → `checkout()` and `cancelOrder()` for custom reasons

**Pros:**
- No duplicate entries
- Simpler code
- Single source of truth

**Cons:**
- Generic reasons in logs (unless you add context columns)

#### Option 2: Update Trigger to Check for Existing Log (Alternative)
Modify trigger to only log if application hasn't already logged it (check last log timestamp).

**Pros:**
- Keep custom reasons from application
- Fallback logging for background jobs

**Cons:**
- More complex logic
- Race condition possibilities

## Recommended Approach:

### For Now (until background jobs are implemented):
**Keep current application-level logging** as-is. The trigger is ready but not yet applied.

### When Adding Background Jobs:
1. Apply the trigger migration:
   ```bash
   psql $DATABASE_URL -f prisma/migrations/add_stock_change_trigger.sql
   ```

2. Remove duplicate logging from these endpoints:
   - PATCH `/api/shops/:shopId/products/:shopProductId/stock`
   - POST `/api/shops/:shopId/products` 
   - PUT `/api/shops/:shopId/products/:shopProductId`

3. Keep custom logging in order-related functions for detailed reasons

### Enhanced Trigger Option (If you want custom reasons):

Add a `context` column to `shop_products_log`:
```sql
ALTER TABLE shop_products_log ADD COLUMN context JSONB;
```

Then store rich context from application:
```typescript
// In your controllers, before updating stock:
await prisma.$executeRaw`
  SELECT set_config('app.stock_change_context', 
    '{"user_id": "${userId}", "role": "${role}", "action": "manual_adjustment"}', 
    true)
`;
```

And modify trigger to read it:
```sql
change_reason := COALESCE(
  current_setting('app.stock_change_context', true),
  'Automatic stock change'
);
```

## Testing the Trigger:

```bash
# Apply migration
psql $DATABASE_URL -f prisma/migrations/add_stock_change_trigger.sql

# Test it
curl -X PATCH http://localhost:3000/api/shops/{shopId}/products/{productId}/stock \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stock_quantity": 20}'

# Check logs (should see entries)
curl http://localhost:3000/api/shops/{shopId}/products/{productId}/stock-logs \
  -H "Authorization: Bearer $TOKEN"
```

## Decision:
Choose Option 1 when you're ready to add background jobs. Until then, current implementation is fine.
