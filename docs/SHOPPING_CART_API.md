# Shopping Cart API Documentation

## Overview
The Shopping Cart API provides endpoints for managing user shopping carts in the Sankha v.4 e-commerce platform. Carts are implemented as orders with `CART` status, allowing seamless conversion to confirmed orders during checkout.

## Architecture
- **Cart Model**: Uses the `orders` table with `status: "CART"`
- **Multi-Shop Support**: Users can have separate carts for different shops
- **Temporary IDs**: Cart orders use temporary order numbers (e.g., `CART-{userId}-{shopId}`)
- **Stock Validation**: All cart operations validate product availability and stock levels
- **Auto-Total Calculation**: Cart totals are automatically calculated and updated

## Base URL
```
/api/cart
```

## Authentication
All cart endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Endpoints

### 1. Get User's Cart
Retrieves all cart items across all shops for the authenticated user.

**Endpoint:** `GET /api/cart`

**Authorization:** Protected (USER, SELLER, ADMIN, SUPER_ADMIN)

**Request:**
```bash
curl -X GET http://localhost:3000/api/cart \
  -H "Authorization: Bearer <token>"
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "carts": [
      {
        "cart_id": "3062b12b-eb63-4500-b8b9-0860537a8b7d",
        "shop": {
          "id": "0f9ee830-8261-4da2-a262-97786c387d63",
          "name": "TechHub Lilongwe",
          "city": "Lilongwe",
          "delivery_enabled": true
        },
        "items": [
          {
            "id": "0d1151b2-e407-4794-aaac-bab5c55070d8",
            "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
            "product": {
              "id": "19cee667-2016-46c0-98ee-5a33be9643f4",
              "name": "iPhone 15 Pro Max",
              "brand": "Apple",
              "images": ["https://images.unsplash.com/..."]
            },
            "product_name": "iPhone 15 Pro Max",
            "quantity": 2,
            "unit_price": 865000,
            "total_price": 1730000,
            "stock_available": 8,
            "is_available": true
          }
        ],
        "subtotal": 1730000,
        "item_count": 1
      }
    ],
    "total_items": 1,
    "total_amount": 1730000,
    "shop_count": 1
  }
}
```

**Empty Cart Response:**
```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "carts": [],
    "total_items": 0,
    "total_amount": 0,
    "shop_count": 0
  }
}
```

---

### 2. Add Item to Cart
Adds a product to the user's cart. If the item already exists, the quantity is incremented.

**Endpoint:** `POST /api/cart`

**Authorization:** Protected (USER, SELLER, ADMIN, SUPER_ADMIN)

**Request Body:**
```json
{
  "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
  "quantity": 2
}
```

**Validation Rules:**
- `shop_product_id`: Required, must be valid UUID
- `quantity`: Required, integer, min: 1, max: 100

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/cart \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
    "quantity": 2
  }'
```

**Success Response (200 OK) - New Item:**
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "item": {
      "id": "4475d342-8e8e-4c94-803d-0594607456d3",
      "order_id": "f256733b-6a47-4cfa-9f10-2f3adb41676f",
      "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
      "product_name": "iPhone 15 Pro Max",
      "quantity": 2,
      "unit_price": "865000",
      "shop_products": {
        "price": "865000",
        "stock_quantity": 8,
        "is_available": true,
        "products": {
          "name": "iPhone 15 Pro Max",
          "brand": "Apple"
        }
      }
    },
    "cart_total": 1730000
  }
}
```

**Success Response (200 OK) - Quantity Updated:**
```json
{
  "success": true,
  "message": "Cart item updated successfully",
  "data": {
    "item": { /* updated item */ },
    "cart_total": 2595000
  }
}
```

**Error Responses:**

**404 Not Found** - Product doesn't exist:
```json
{
  "success": false,
  "message": "Shop product not found"
}
```

**400 Bad Request** - Product unavailable:
```json
{
  "success": false,
  "message": "This product is currently unavailable"
}
```

**400 Bad Request** - Insufficient stock:
```json
{
  "success": false,
  "message": "Insufficient stock. Only 8 available"
}
```

**400 Bad Request** - Exceeds stock when updating existing item:
```json
{
  "success": false,
  "message": "Cannot add 5 more. Maximum available: 3"
}
```

---

### 3. Update Cart Item Quantity
Updates the quantity of a specific item in the cart.

**Endpoint:** `PUT /api/cart/items/:itemId`

**Authorization:** Protected (USER, SELLER, ADMIN, SUPER_ADMIN)

**URL Parameters:**
- `itemId`: UUID of the cart item (order_items.id)

**Request Body:**
```json
{
  "quantity": 3
}
```

**Validation Rules:**
- `quantity`: Required, integer, min: 1, max: 100

**Request Example:**
```bash
curl -X PUT http://localhost:3000/api/cart/items/57036dc6-22e6-488f-ac58-7b9f2cda9206 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3}'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Cart item updated successfully",
  "data": {
    "item": {
      "id": "57036dc6-22e6-488f-ac58-7b9f2cda9206",
      "product_name": "Sony WH-1000XM5",
      "quantity": 3,
      "unit_price": "190000"
    },
    "cart_total": 1435000
  }
}
```

**Error Responses:**

**404 Not Found** - Item doesn't exist:
```json
{
  "success": false,
  "message": "Cart item not found"
}
```

**403 Forbidden** - Not the cart owner:
```json
{
  "success": false,
  "message": "Unauthorized to modify this cart item"
}
```

**400 Bad Request** - Trying to modify confirmed order:
```json
{
  "success": false,
  "message": "Cannot modify confirmed order items"
}
```

**400 Bad Request** - Insufficient stock:
```json
{
  "success": false,
  "message": "Insufficient stock. Only 15 available"
}
```

---

### 4. Remove Item from Cart
Removes a specific item from the cart. If it's the last item, the entire cart is deleted.

**Endpoint:** `DELETE /api/cart/items/:itemId`

**Authorization:** Protected (USER, SELLER, ADMIN, SUPER_ADMIN)

**URL Parameters:**
- `itemId`: UUID of the cart item (order_items.id)

**Request Example:**
```bash
curl -X DELETE http://localhost:3000/api/cart/items/57036dc6-22e6-488f-ac58-7b9f2cda9206 \
  -H "Authorization: Bearer <token>"
```

**Success Response (200 OK) - Item removed, cart still has items:**
```json
{
  "success": true,
  "message": "Item removed from cart",
  "data": {
    "cart_total": 865000,
    "items_remaining": 1
  }
}
```

**Success Response (200 OK) - Last item removed, cart deleted:**
```json
{
  "success": true,
  "message": "Item removed and cart deleted (was empty)",
  "data": {
    "cart_deleted": true
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "Cart item not found"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Unauthorized to remove this cart item"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Cannot remove items from confirmed orders"
}
```

---

### 5. Clear Entire Cart
Deletes all carts (from all shops) for the authenticated user.

**Endpoint:** `DELETE /api/cart`

**Authorization:** Protected (USER, SELLER, ADMIN, SUPER_ADMIN)

**Request Example:**
```bash
curl -X DELETE http://localhost:3000/api/cart \
  -H "Authorization: Bearer <token>"
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Cart cleared successfully (2 cart(s) deleted)",
  "data": {
    "carts_cleared": 2
  }
}
```

**Success Response (200 OK) - No carts to clear:**
```json
{
  "success": true,
  "message": "Cart cleared successfully (0 cart(s) deleted)",
  "data": {
    "carts_cleared": 0
  }
}
```

---

## Business Rules

### 1. Multi-Shop Carts
- Users can have **separate carts for different shops**
- Each shop gets its own cart (order with `CART` status)
- When adding items, the system automatically groups by shop

### 2. Stock Validation
- **Before adding**: Checks if requested quantity is available
- **When updating**: Validates new quantity against current stock
- **Real-time**: Stock levels are checked at each operation
- **Error handling**: Clear messages indicate available quantity

### 3. Automatic Calculations
- **Cart total**: Sum of (quantity × unit_price) for all items
- **Updated on**:
  - Adding items
  - Updating quantities
  - Removing items
- **Precision**: Stored as Decimal(10,2) for currency accuracy

### 4. Cart Lifecycle
```
Empty State → Add Item → CART created
CART → Add more items → Items accumulated
CART → Remove all items → CART deleted
CART → Checkout → Status changes to CONFIRMED
```

### 5. Item Price Snapshot
- **Unit price**: Captured at the time of adding to cart
- **Price changes**: Don't affect items already in cart
- **Checkout**: Uses the price from cart, not current product price
- **Transparency**: Users see the price they agreed to

### 6. Ownership & Security
- **User isolation**: Users can only access their own carts
- **Cart validation**: System verifies cart ownership on every operation
- **No admin override**: Even admins can't modify others' carts (privacy)

### 7. Product Availability
- **is_available flag**: Must be `true` to add to cart
- **Stock quantity**: Must be > 0 and >= requested quantity
- **Unavailable products**: Cannot be added, clear error message

---

## Use Cases

### Use Case 1: First-Time Add to Cart
```bash
# User browses TechHub Lilongwe, adds iPhone
POST /api/cart
{
  "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
  "quantity": 1
}

# System:
# 1. Verifies product exists and is available
# 2. Checks stock (8 available)
# 3. Creates new cart for TechHub Lilongwe
# 4. Adds item with price snapshot (865000)
# 5. Calculates total (865000)
# 6. Returns item + cart_total
```

### Use Case 2: Adding Same Item Again
```bash
# User adds another iPhone to existing cart
POST /api/cart
{
  "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
  "quantity": 1
}

# System:
# 1. Finds existing cart item
# 2. Increments quantity (1 + 1 = 2)
# 3. Validates stock (8 available, need 2 ✓)
# 4. Updates quantity
# 5. Recalculates total (1,730,000)
# 6. Returns "Cart item updated successfully"
```

### Use Case 3: Multi-Shop Shopping
```bash
# User adds from TechHub Lilongwe
POST /api/cart { "shop_product_id": "tech-item", "quantity": 1 }
# Creates Cart 1 for TechHub

# User adds from Digital World Blantyre  
POST /api/cart { "shop_product_id": "digital-item", "quantity": 1 }
# Creates Cart 2 for Digital World

# Get cart shows both
GET /api/cart
# Returns:
{
  "carts": [
    { "shop": "TechHub Lilongwe", "items": [...], "subtotal": 865000 },
    { "shop": "Digital World", "items": [...], "subtotal": 760000 }
  ],
  "total_amount": 1625000,
  "shop_count": 2
}
```

### Use Case 4: Stock Limit Protection
```bash
# Product has 8 in stock, user already has 5 in cart
PUT /api/cart/items/{id}
{ "quantity": 10 }

# System responds:
{
  "success": false,
  "message": "Insufficient stock. Only 8 available"
}
```

### Use Case 5: Clear Cart Before Checkout
```bash
# User changes mind, wants to start fresh
DELETE /api/cart

# System:
# 1. Finds all carts for user (2 carts)
# 2. Deletes both (cascade deletes items)
# 3. Returns count
{
  "message": "Cart cleared successfully (2 cart(s) deleted)",
  "data": { "carts_cleared": 2 }
}
```

---

## Integration with Checkout Flow

### Step 1: Shopping (Current - Cart API)
```javascript
// User adds items to cart
POST /api/cart { shop_product_id, quantity }

// Reviews cart
GET /api/cart
```

### Step 2: Checkout (Future - Order API)
```javascript
// User proceeds to checkout
POST /api/orders/checkout
{
  "cart_id": "3062b12b-eb63-4500-b8b9-0860537a8b7d",
  "delivery_address_id": "user-address-uuid",
  "payment_method": "MOBILE_MONEY"
}

// System:
// 1. Validates cart exists and has items
// 2. Re-validates stock for all items
// 3. Generates order_number (ORD-2024-XXX)
// 4. Updates status: CART → CONFIRMED
// 5. Creates payment record
// 6. Reduces stock quantities
// 7. Returns order details
```

### Step 3: Order Placed
- Cart becomes a confirmed order
- No longer appears in `GET /api/cart`
- Appears in order history
- Payment processing begins

---

## Error Handling

### Common Errors

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 400 | Validation error | Invalid request body | Check request format |
| 400 | Product unavailable | is_available = false | Choose another product |
| 400 | Insufficient stock | Quantity > stock_quantity | Reduce quantity |
| 400 | Cannot modify order | Status != CART | Item is in confirmed order |
| 401 | Unauthorized | Missing/invalid token | Login again |
| 403 | Forbidden | Not cart owner | Access own cart only |
| 404 | Product not found | Invalid shop_product_id | Verify product exists |
| 404 | Cart item not found | Invalid itemId | Check cart contents |
| 500 | Server error | System issue | Contact support |

---

## Testing Examples

### Complete Shopping Flow Test
```bash
# 1. Login as Alice
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice.banda@gmail.com","password":"password123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. Check empty cart
curl -X GET http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN"
# Expected: Empty cart

# 3. Add iPhone to cart
curl -X POST http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shop_product_id":"3aba6720-ae3b-466e-ac25-5739bd2afb27","quantity":2}'
# Expected: Item added, total = 1,730,000

# 4. Get cart
curl -X GET http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN"
# Expected: 1 cart, 1 item, quantity=2

# 5. Update quantity to 1
curl -X PUT http://localhost:3000/api/cart/items/{ITEM_ID} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":1}'
# Expected: Quantity updated, total = 865,000

# 6. Remove item
curl -X DELETE http://localhost:3000/api/cart/items/{ITEM_ID} \
  -H "Authorization: Bearer $TOKEN"
# Expected: Item removed, cart deleted

# 7. Verify empty
curl -X GET http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN"
# Expected: Empty cart again
```

---

## Performance Considerations

### Database Queries
- **GET cart**: 1 query with includes (shops, products, shop_products)
- **Add item**: 3-4 queries (find product, find/create cart, create/update item, update total)
- **Update item**: 3 queries (find item, update, recalculate total)
- **Remove item**: 3-4 queries (find, delete, check remaining, update/delete cart)

### Optimization Tips
1. **Indexes**: Ensure indexes on `buyer_id`, `status`, `shop_product_id`
2. **Caching**: Consider caching cart data for frequent access
3. **Batch operations**: Future enhancement for adding multiple items at once
4. **Lazy loading**: Only load product details when needed

---

## Future Enhancements

### Planned Features
- [ ] **Save for Later**: Move items to wishlist
- [ ] **Cart expiration**: Auto-clear abandoned carts after 30 days
- [ ] **Quantity limits**: Per-product purchase limits
- [ ] **Bulk operations**: Add/remove multiple items at once
- [ ] **Cart sharing**: Share cart link with others
- [ ] **Price drop alerts**: Notify if cart item price decreases
- [ ] **Stock notifications**: Alert when out-of-stock items return
- [ ] **Cart analytics**: Track cart abandonment rates

---

## Related APIs
- **Shop Products API**: Browse products to add to cart
- **Order API**: Convert cart to order (checkout)
- **Payment API**: Process payment for orders
- **User Addresses API**: Select delivery address for checkout

---

## Summary

The Shopping Cart API provides a robust, production-ready cart system with:
- ✅ Multi-shop support
- ✅ Real-time stock validation  
- ✅ Automatic price snapshots
- ✅ Ownership security
- ✅ Seamless checkout integration
- ✅ Clear error handling
- ✅ Comprehensive testing

**Next Steps**: Implement Order Management API to enable checkout flow from cart to confirmed orders.

---

**Last Updated**: November 19, 2025  
**API Version**: 1.0  
**Status**: Production Ready ✅
