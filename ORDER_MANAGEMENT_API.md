# Order Management API Documentation

## Overview
The Order Management API provides complete functionality for converting shopping carts into orders, managing the order lifecycle, and tracking order status from checkout to delivery or cancellation.

## Table of Contents
1. [Order Workflow](#order-workflow)
2. [API Endpoints](#api-endpoints)
3. [Business Rules](#business-rules)
4. [Status Transitions](#status-transitions)
5. [Testing Guide](#testing-guide)

---

## Order Workflow

### Purchase Flow
```
1. Browse Products → Add to Cart → Checkout → Order Created
2. Order Status: CONFIRMED → PREPARING → READY_FOR_PICKUP/OUT_FOR_DELIVERY → DELIVERED
3. Payment Status: PENDING → PAID
4. Notifications: Order messages created at each status change
```

### Key Features
- **Multi-Shop Support**: One order per shop from separate carts
- **Automatic Order Numbers**: Format `ORD-YYYY-XXXXXX` (sequential per year)
- **Stock Management**: Reduce on checkout, restore on cancellation
- **Payment Integration**: Payment records created with orders
- **Authorization**: Role-based access (Buyer, Seller, Admin)
- **Status Workflow**: State machine with validated transitions
- **Notifications**: Order messages for status updates

---

## API Endpoints

### 1. Checkout (Convert Cart to Order)

**Endpoint:** `POST /api/orders/checkout`

**Authentication:** Required (USER role)

**Description:** Converts all user's shopping carts into confirmed orders (one order per shop). Validates stock, generates order numbers, reduces inventory, and creates payment records.

**Request Body:**
```json
{
  "delivery_address_id": "uuid",
  "payment_method": "MOBILE_MONEY" | "BANK_TRANSFER" | "CASH_ON_DELIVERY",
  "provider": "string (optional, e.g., 'Airtel Money', 'TNM Mpamba')",
  "customer_phone": "string (optional, for mobile money)"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "orders": [
      {
        "order_id": "uuid",
        "order_number": "ORD-2025-000001",
        "shop": "TechHub Lilongwe",
        "total_amount": 2595000,
        "status": "CONFIRMED",
        "items_count": 2,
        "delivery_address": {
          "id": "uuid",
          "contact_name": "Alice Banda",
          "address_line1": "Plot 123, Area 25",
          "city": "Lilongwe",
          "country": "Malawi",
          "is_default": true
        },
        "payment": {
          "id": "uuid",
          "method": "MOBILE_MONEY",
          "provider": "Airtel Money",
          "amount": 2595000,
          "status": "PENDING",
          "customer_phone": "+265991234567"
        }
      }
    ]
  }
}
```

**Error Responses:**
```json
// No cart items
{
  "success": false,
  "message": "Your cart is empty"
}

// Address not found or doesn't belong to user
{
  "success": false,
  "message": "Delivery address not found"
}

// Insufficient stock
{
  "success": false,
  "message": "Some items have insufficient stock",
  "data": {
    "stock_issues": [
      {
        "product": "iPhone 15 Pro Max",
        "shop": "TechHub Lilongwe",
        "requested": 10,
        "available": 5
      }
    ]
  }
}
```

**Stock Management:**
- Validates stock availability for ALL items before processing
- Reduces stock quantity atomically during checkout
- Logs stock changes to `shop_products_log` table
- Returns detailed errors if any item has insufficient stock

**Example:**
```bash
curl -X POST http://localhost:3000/api/orders/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "delivery_address_id": "0e07f901-ee98-412c-9db8-7766d063b3a7",
    "payment_method": "MOBILE_MONEY",
    "provider": "Airtel Money",
    "customer_phone": "+265991234567"
  }'
```

---

### 2. Get My Orders (Buyer View)

**Endpoint:** `GET /api/orders/my-orders`

**Authentication:** Required (USER role)

**Description:** Retrieves all orders placed by the authenticated user with pagination and filtering options.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 10, max: 100)
status: order_status enum (optional filter)
start_date: ISO date string (optional)
end_date: ISO date string (optional)
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_number": "ORD-2025-000001",
        "status": "CONFIRMED",
        "total_amount": 2595000,
        "created_at": "2025-11-19T14:32:14.034Z",
        "updated_at": "2025-11-19T16:41:32.728Z",
        "shop": {
          "id": "uuid",
          "name": "TechHub Lilongwe"
        },
        "delivery_address": {
          "contact_name": "Alice Banda",
          "address_line1": "Plot 123, Area 25",
          "city": "Lilongwe"
        },
        "items_summary": {
          "total_items": 2,
          "products": ["iPhone 15 Pro Max", "MacBook Pro 16"]
        },
        "payment": {
          "method": "MOBILE_MONEY",
          "status": "PENDING"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCount": 25,
      "limit": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Example:**
```bash
# Get all orders
curl "http://localhost:3000/api/orders/my-orders" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by status
curl "http://localhost:3000/api/orders/my-orders?status=DELIVERED&page=1&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by date range
curl "http://localhost:3000/api/orders/my-orders?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 3. Get Order Details

**Endpoint:** `GET /api/orders/:orderId`

**Authentication:** Required (USER, SELLER, ADMIN)

**Authorization:**
- Buyers can view their own orders
- Shop owners can view orders for their shops
- Admins can view all orders

**Description:** Retrieves complete details for a specific order including items, payment, delivery address, and messages.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order retrieved successfully",
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "ORD-2025-000001",
      "status": "CONFIRMED",
      "total_amount": 2595000,
      "created_at": "2025-11-19T14:32:14.034Z",
      "updated_at": "2025-11-19T16:41:32.728Z",
      "shop": {
        "id": "uuid",
        "name": "TechHub Lilongwe",
        "owner": {
          "id": "uuid",
          "first_name": "John",
          "last_name": "Phiri",
          "email": "john.phiri@techstore.mw",
          "phone_number": "+265998765432"
        }
      },
      "buyer": {
        "id": "uuid",
        "first_name": "Alice",
        "last_name": "Banda",
        "email": "alice.banda@gmail.com",
        "phone_number": "+265991234567"
      },
      "delivery_address": {
        "id": "uuid",
        "contact_name": "Alice Banda",
        "address_line1": "Plot 123, Area 25",
        "address_line2": null,
        "city": "Lilongwe",
        "district": "Lilongwe",
        "country": "Malawi",
        "latitude": "-13.962612",
        "longitude": "33.774119",
        "is_default": true
      },
      "items": [
        {
          "id": "uuid",
          "product_name": "iPhone 15 Pro Max",
          "quantity": 3,
          "unit_price": 865000,
          "total_price": 2595000,
          "product_details": {
            "id": "uuid",
            "name": "iPhone 15 Pro Max",
            "brand": "Apple",
            "description": "Latest iPhone model",
            "images": ["url1", "url2"],
            "category_id": "uuid"
          }
        }
      ],
      "payments": [
        {
          "id": "uuid",
          "method": "MOBILE_MONEY",
          "provider": "Airtel Money",
          "amount": 2595000,
          "status": "PENDING",
          "customer_phone": "+265991234567",
          "created_at": "2025-11-19T16:41:32.745Z"
        }
      ],
      "messages": [
        {
          "id": "uuid",
          "message": "Order confirmed and payment pending",
          "created_at": "2025-11-19T16:41:32.751Z"
        }
      ]
    }
  }
}
```

**Error Responses:**
```json
// Order not found
{
  "success": false,
  "message": "Order not found"
}

// Unauthorized access
{
  "success": false,
  "message": "You are not authorized to view this order"
}
```

**Example:**
```bash
curl "http://localhost:3000/api/orders/f256733b-6a47-4cfa-9f10-2f3adb41676f" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 4. Get Shop Orders (Seller View)

**Endpoint:** `GET /api/orders/shop/:shopId`

**Authentication:** Required (SELLER, ADMIN)

**Authorization:**
- Shop owners can only view orders for their own shops
- Admins can view orders for any shop

**Description:** Retrieves all orders for a specific shop with pagination and filtering options.

**Query Parameters:**
```
page: number (default: 1)
limit: number (default: 10, max: 100)
status: order_status enum (optional filter)
start_date: ISO date string (optional)
end_date: ISO date string (optional)
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Shop orders retrieved successfully",
  "data": {
    "shop": {
      "id": "uuid",
      "name": "TechHub Lilongwe"
    },
    "orders": [
      {
        "id": "uuid",
        "order_number": "ORD-2025-000001",
        "status": "CONFIRMED",
        "total_amount": 2595000,
        "created_at": "2025-11-19T14:32:14.034Z",
        "buyer": {
          "id": "uuid",
          "first_name": "Alice",
          "last_name": "Banda",
          "email": "alice.banda@gmail.com",
          "phone_number": "+265991234567"
        },
        "delivery_address": {
          "contact_name": "Alice Banda",
          "address_line1": "Plot 123, Area 25",
          "city": "Lilongwe"
        },
        "items": [
          {
            "product_name": "iPhone 15 Pro Max",
            "quantity": 3,
            "unit_price": 865000
          }
        ],
        "payment": {
          "method": "MOBILE_MONEY",
          "status": "PENDING"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalCount": 15,
      "limit": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Error Responses:**
```json
// Shop not found
{
  "success": false,
  "message": "Shop not found"
}

// Unauthorized access
{
  "success": false,
  "message": "You are not authorized to view orders for this shop"
}
```

**Example:**
```bash
# Get all shop orders
curl "http://localhost:3000/api/orders/shop/0f9ee830-8261-4da2-a262-97786c387d63" \
  -H "Authorization: Bearer SELLER_JWT_TOKEN"

# Filter by status
curl "http://localhost:3000/api/orders/shop/0f9ee830-8261-4da2-a262-97786c387d63?status=PREPARING" \
  -H "Authorization: Bearer SELLER_JWT_TOKEN"
```

---

### 5. Update Order Status

**Endpoint:** `PATCH /api/orders/:orderId/status`

**Authentication:** Required (SELLER, ADMIN)

**Authorization:**
- Shop owners can update orders for their own shops
- Admins can update any order

**Description:** Updates the status of an order following the allowed state transitions. Creates an order message notification for the buyer.

**Request Body:**
```json
{
  "status": "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED",
  "notes": "string (optional)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "ORD-2025-000001",
      "previous_status": "CONFIRMED",
      "current_status": "PREPARING",
      "updated_at": "2025-11-19T16:57:49.123Z",
      "notes": "Order is being prepared for delivery"
    }
  }
}
```

**Error Responses:**
```json
// Invalid status transition
{
  "success": false,
  "message": "Invalid status transition from CONFIRMED to DELIVERED"
}

// Order not found
{
  "success": false,
  "message": "Order not found"
}

// Unauthorized
{
  "success": false,
  "message": "You are not authorized to update this order"
}
```

**Example:**
```bash
curl -X PATCH "http://localhost:3000/api/orders/f256733b-6a47-4cfa-9f10-2f3adb41676f/status" \
  -H "Authorization: Bearer SELLER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PREPARING",
    "notes": "Order is being prepared for delivery"
  }'
```

---

### 6. Cancel Order

**Endpoint:** `POST /api/orders/:orderId/cancel`

**Authentication:** Required (USER, SELLER, ADMIN)

**Authorization:**
- Buyers can cancel their own orders
- Shop owners can cancel orders for their shops
- Admins can cancel any order

**Restrictions:**
- Cannot cancel orders with status: DELIVERED, CANCELLED, REFUNDED

**Description:** Cancels an order, restores stock to inventory, updates payment status to CANCELLED, and creates a cancellation notification.

**Request Body:**
```json
{
  "reason": "string (required, 10-500 characters)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "ORD-2025-000001",
      "status": "CANCELLED",
      "cancelled_by": "buyer" | "seller",
      "reason": "Changed my mind, found a better deal elsewhere",
      "cancelled_at": "2025-11-19T16:58:15.456Z"
    }
  }
}
```

**Error Responses:**
```json
// Order cannot be cancelled
{
  "success": false,
  "message": "Cannot cancel order with status DELIVERED"
}

// Order not found
{
  "success": false,
  "message": "Order not found"
}

// Unauthorized
{
  "success": false,
  "message": "You are not authorized to cancel this order"
}

// Validation error
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "reason",
      "message": "Reason must be at least 10 characters"
    }
  ]
}
```

**Stock Restoration:**
- All order items have their quantities added back to inventory
- Stock changes are logged to `shop_products_log`
- Payment status updated to CANCELLED
- Order message created with cancellation details

**Example:**
```bash
curl -X POST "http://localhost:3000/api/orders/f256733b-6a47-4cfa-9f10-2f3adb41676f/cancel" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Changed my mind, found a better deal elsewhere"
  }'
```

---

## Business Rules

### Order Numbers
- **Format:** `ORD-YYYY-XXXXXX` (e.g., `ORD-2025-000001`)
- **Generation:** Sequential counter per year
- **Uniqueness:** Guaranteed unique across all orders
- **Reset:** Counter resets each year (e.g., ORD-2026-000001)

### Multi-Shop Orders
- Each cart belongs to a single shop
- Checkout creates one order per shop
- Each order has its own order number and payment
- Orders are processed independently

### Stock Management
- **On Checkout:**
  - Validates all items have sufficient stock
  - Reduces `stock_quantity` for each item
  - Logs changes to `shop_products_log` (action: ORDER_PLACED)
  
- **On Cancellation:**
  - Restores `stock_quantity` for all items
  - Logs changes to `shop_products_log` (action: ORDER_CANCELLED)

### Payment Integration
- Payment record created during checkout with status PENDING
- Payment methods: MOBILE_MONEY, BANK_TRANSFER, CASH_ON_DELIVERY
- Payment status updated separately (handled by payment webhook)
- Order can proceed regardless of payment status

### Authorization Rules
| Action | USER | SELLER | ADMIN |
|--------|------|--------|-------|
| Checkout | ✅ Own | ❌ | ✅ |
| View Order | ✅ Own | ✅ Own Shop | ✅ All |
| List Orders (Buyer) | ✅ Own | ❌ | ✅ All |
| List Orders (Shop) | ❌ | ✅ Own Shop | ✅ All |
| Update Status | ❌ | ✅ Own Shop | ✅ All |
| Cancel Order | ✅ Own | ✅ Own Shop | ✅ All |

### Notifications
- Order message created for each status change
- Messages include: status updates, cancellations, delivery confirmations
- Messages stored in `order_messages` table
- Future: Email/SMS notifications from these messages

---

## Status Transitions

### Order Status Flow

```
CART (Shopping Cart)
  ↓ (Checkout)
CONFIRMED (Order Placed, Payment Pending)
  ↓
PREPARING (Seller preparing items)
  ↓
READY_FOR_PICKUP (Pickup orders)  OR  OUT_FOR_DELIVERY (Delivery orders)
  ↓
DELIVERED (Order completed)

// Alternative flows
CONFIRMED/PREPARING/READY_FOR_PICKUP/OUT_FOR_DELIVERY
  ↓ (Cancellation)
CANCELLED (Order cancelled, stock restored)

DELIVERED
  ↓ (Refund request)
REFUNDED (Order refunded)
```

### Allowed Transitions

| From Status | To Status | Who Can Update |
|-------------|-----------|----------------|
| CART | CONFIRMED | System (on checkout) |
| CONFIRMED | PREPARING | Seller, Admin |
| CONFIRMED | CANCELLED | Buyer, Seller, Admin |
| PREPARING | READY_FOR_PICKUP | Seller, Admin |
| PREPARING | OUT_FOR_DELIVERY | Seller, Admin |
| PREPARING | CANCELLED | Buyer, Seller, Admin |
| READY_FOR_PICKUP | DELIVERED | Seller, Admin |
| READY_FOR_PICKUP | CANCELLED | Buyer, Seller, Admin |
| OUT_FOR_DELIVERY | DELIVERED | Seller, Admin |
| OUT_FOR_DELIVERY | CANCELLED | Buyer, Seller, Admin |
| DELIVERED | REFUNDED | Admin (after refund approval) |

### Invalid Transitions
- CART → Any status except CONFIRMED (must checkout)
- Any status → CART (cannot revert to cart)
- DELIVERED → CANCELLED (use REFUNDED instead)
- CANCELLED → Any other status (final state)
- REFUNDED → Any other status (final state)

---

## Testing Guide

### Prerequisites
```bash
# Ensure server is running
npm run dev

# Test users from seed data:
# Buyer: alice.banda@gmail.com / password123
# Seller: john.phiri@techstore.mw / secure456
# Admin: peter.nyirenda@admin.com / admin321
```

### Test Scenario 1: Complete Order Flow

```bash
# 1. Login as buyer (Alice)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice.banda@gmail.com","password":"password123"}' \
  | jq -r '.data.token')

# 2. Add item to cart
curl -X POST http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shop_product_id": "3aba6720-ae3b-466e-ac25-5739bd2afb27",
    "quantity": 2
  }'

# 3. Checkout
curl -X POST http://localhost:3000/api/orders/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "delivery_address_id": "0e07f901-ee98-412c-9db8-7766d063b3a7",
    "payment_method": "MOBILE_MONEY",
    "provider": "Airtel Money",
    "customer_phone": "+265991234567"
  }'

# 4. View order (save order_id from checkout response)
ORDER_ID="<order_id_from_checkout>"
curl "http://localhost:3000/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN"

# 5. List my orders
curl "http://localhost:3000/api/orders/my-orders?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Test Scenario 2: Seller Order Management

```bash
# 1. Login as seller (John)
SELLER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}' \
  | jq -r '.data.token')

# 2. View shop orders
SHOP_ID="0f9ee830-8261-4da2-a262-97786c387d63"
curl "http://localhost:3000/api/orders/shop/$SHOP_ID" \
  -H "Authorization: Bearer $SELLER_TOKEN"

# 3. Update order status to PREPARING
ORDER_ID="<order_id>"
curl -X PATCH "http://localhost:3000/api/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PREPARING",
    "notes": "Order is being prepared"
  }'

# 4. Update to OUT_FOR_DELIVERY
curl -X PATCH "http://localhost:3000/api/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "OUT_FOR_DELIVERY",
    "notes": "Order dispatched for delivery"
  }'

# 5. Mark as DELIVERED
curl -X PATCH "http://localhost:3000/api/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DELIVERED",
    "notes": "Order delivered successfully"
  }'
```

### Test Scenario 3: Order Cancellation

```bash
# 1. Create order (follow Test Scenario 1, steps 1-3)

# 2. Cancel order as buyer
ORDER_ID="<order_id>"
curl -X POST "http://localhost:3000/api/orders/$ORDER_ID/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Changed my mind, found a better deal elsewhere"
  }'

# 3. Verify stock was restored
curl "http://localhost:3000/api/shops/$SHOP_ID/products/$PRODUCT_ID"
```

### Test Scenario 4: Error Handling

```bash
# Test 1: Checkout with empty cart
curl -X POST http://localhost:3000/api/orders/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "delivery_address_id": "0e07f901-ee98-412c-9db8-7766d063b3a7",
    "payment_method": "MOBILE_MONEY"
  }'
# Expected: 400 - "Your cart is empty"

# Test 2: Invalid status transition
curl -X PATCH "http://localhost:3000/api/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DELIVERED"
  }'
# Expected: 400 - "Invalid status transition from CONFIRMED to DELIVERED"

# Test 3: Cancel delivered order
curl -X POST "http://localhost:3000/api/orders/$DELIVERED_ORDER_ID/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "I want to cancel"
  }'
# Expected: 400 - "Cannot cancel order with status DELIVERED"

# Test 4: Unauthorized access
curl "http://localhost:3000/api/orders/$OTHER_USER_ORDER_ID" \
  -H "Authorization: Bearer $TOKEN"
# Expected: 403 - "You are not authorized to view this order"
```

### Expected Test Results

✅ **All 6 Endpoints Tested:**
1. ✅ POST /api/orders/checkout - Order created successfully
2. ✅ GET /api/orders/my-orders - Returns buyer's orders
3. ✅ GET /api/orders/:orderId - Returns order details
4. ✅ GET /api/orders/shop/:shopId - Returns shop orders
5. ✅ PATCH /api/orders/:orderId/status - Status updated (CONFIRMED → PREPARING)
6. ✅ POST /api/orders/:orderId/cancel - Order cancelled, stock restored

✅ **Stock Management:**
- Stock reduced on checkout (8 → 5 for quantity 3)
- Stock restored on cancellation (5 → 8)

✅ **Authorization:**
- Buyers can only view/cancel their own orders
- Sellers can manage orders for their shops
- Admins have full access

---

## Integration Examples

### Frontend Integration

```javascript
// Order service example
class OrderService {
  async checkout(deliveryAddressId, paymentMethod, provider, phone) {
    const response = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        delivery_address_id: deliveryAddressId,
        payment_method: paymentMethod,
        provider: provider,
        customer_phone: phone
      })
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message);
    }
    
    return data.data.orders;
  }

  async getMyOrders(page = 1, status = null) {
    const params = new URLSearchParams({ page, limit: 10 });
    if (status) params.append('status', status);
    
    const response = await fetch(`/api/orders/my-orders?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    return await response.json();
  }

  async updateOrderStatus(orderId, status, notes) {
    const response = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status, notes })
    });
    
    return await response.json();
  }

  async cancelOrder(orderId, reason) {
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    
    return await response.json();
  }
}
```

---

## Notes

### Payment Integration (Future)
- Currently payment records are created with PENDING status
- Future: Integrate with Airtel Money, TNM Mpamba APIs
- Webhook endpoints to update payment status to PAID
- Order fulfillment should wait for payment confirmation

### Delivery Integration (Future)
- Track delivery partners
- Real-time location tracking
- Delivery confirmation with signature/photo
- SMS notifications to buyer when out for delivery

### Analytics (Future)
- Order metrics (total sales, average order value)
- Popular products and shops
- Delivery time analytics
- Customer retention rates

---

## Related Documentation
- [Shopping Cart API](./SHOPPING_CART_API.md)
- [Product API](./PRODUCT_API_DOCUMENTATION.md)
- [Shop Management API](./SHOP_MANAGEMENT_API.md)
- [Authentication & Authorization](./AUTHORIZATION_TEST_RESULTS.md)

---

**Last Updated:** November 19, 2025
**API Version:** 1.0.0
