# Sankha v.4 Backend - Implemented Features

Complete documentation of all implemented functionality, API endpoints, and business logic flows.

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [User Management](#user-management)
3. [Shop Management](#shop-management)
4. [Product Catalog](#product-catalog)
5. [Shop Products (Inventory)](#shop-products-inventory)
6. [Shopping Cart](#shopping-cart)
7. [Orders & Checkout](#orders--checkout)
8. [Payments](#payments)
9. [Reviews](#reviews)
10. [Categories](#categories)
11. [Addresses](#addresses)
12. [Admin Tools](#admin-tools)
13. [Security Features](#security-features)

---

## Authentication & Authorization

### User Registration
- **Endpoint:** `POST /api/auth/register`
- **Rate Limited:** 5 attempts per 15 minutes
- **Validation:** Email format, password strength, required fields
- **Flow:**
  1. Check if email already exists
  2. Hash password with bcrypt (10 rounds)
  3. Create user with default role (USER)
  4. Return user data (without password)

### User Login
- **Endpoint:** `POST /api/auth/login`
- **Rate Limited:** 5 attempts per 15 minutes
- **Flow:**
  1. Find user by email
  2. Check if account is active
  3. Verify password
  4. Generate JWT access token (15 min default)
  5. Generate refresh token (7 days default)
  6. Store refresh token in Redis
  7. Set refresh token as httpOnly cookie
  8. Return access token in response body

### Token Refresh
- **Endpoint:** `POST /api/auth/refresh`
- **Flow:**
  1. Get refresh token from httpOnly cookie (or body for backward compatibility)
  2. Validate token against Redis
  3. Implement token rotation (revoke old, issue new)
  4. Return new access token

### Logout
- **Endpoint:** `POST /api/auth/logout`
- Revokes current refresh token from Redis
- Clears httpOnly cookie

### Logout All Devices
- **Endpoint:** `POST /api/auth/logout-all`
- **Auth Required:** Yes
- Revokes all refresh tokens for the user

### Token Storage
- Access tokens: Short-lived JWT (configurable, default 15m)
- Refresh tokens: Stored in Redis with TTL
- Token hashing: SHA-256 for secure storage
- Device/IP tracking: Stored with refresh token metadata

### Role-Based Access Control
| Role | Permissions |
|------|-------------|
| USER | Browse, purchase, review, manage own profile |
| SELLER | All USER + create/manage shops and products |
| ADMIN | All SELLER + manage users, approve products, moderate |
| SUPER_ADMIN | Full system access including user deletion |

---

## User Management

### Get Own Profile
- **Endpoint:** `GET /api/users/profile`
- **Auth Required:** Yes
- Returns current user's full profile

### Update Profile
- **Endpoint:** `PUT /api/users/profile`
- **Auth Required:** Yes
- **Updatable Fields:** first_name, last_name, phone_number

### Change Password
- **Endpoint:** `PUT /api/users/profile/change-password`
- **Auth Required:** Yes
- Requires current password verification
- Hashes and stores new password

### Profile Image
- **Upload:** `POST /api/users/profile/image`
- **Delete:** `DELETE /api/users/profile/image`
- Uses Cloudinary for storage
- Old image deleted on new upload

### Public Seller Profile
- **Endpoint:** `GET /api/users/:userId/public`
- Returns limited public info for sellers
- Includes their shops

### Admin User Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List all users (paginated, filterable) |
| `/api/users/:userId` | GET | Get user details |
| `/api/users/:userId/role` | PUT | Change user role |
| `/api/users/:userId/status` | PUT | Activate/deactivate user |
| `/api/users/:userId` | DELETE | Delete user (SUPER_ADMIN only) |

---

## Shop Management

### Shop CRUD Operations

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/shops` | GET | Public | List shops with filters |
| `/api/shops/:shopId` | GET | Public | Get shop details |
| `/api/shops` | POST | Seller+ | Create new shop |
| `/api/shops/:shopId` | PUT | Owner/Admin | Update shop |
| `/api/shops/:shopId` | DELETE | Owner/Admin | Delete shop |
| `/api/shops/my-shops` | GET | Seller+ | Get own shops |

### Shop Properties
- Basic info: name, description, business registration number
- Location: address, city, latitude, longitude
- Contact: phone, email
- Media: logo, banner, gallery images
- Settings: delivery_methods, delivery_enabled
- Status: is_verified

### Shop Verification
- **Endpoint:** `PATCH /api/shops/:shopId/verify`
- **Access:** Admin only
- Sets is_verified flag

### Shop Media Upload
| Endpoint | Description |
|----------|-------------|
| `POST /api/shops/:shopId/logo` | Upload shop logo |
| `POST /api/shops/:shopId/banner` | Upload shop banner |
| `POST /api/shops/:shopId/gallery` | Upload gallery images (up to 10) |
| `DELETE /api/shops/:shopId/gallery/:imageIndex` | Delete gallery image |

### Shop Filtering
- Filter by: city, is_verified, delivery_enabled, owner_id
- Search: name, description (case-insensitive)
- Pagination: page, limit

---

## Product Catalog

### Two-Tier Product System

1. **Products (Master Catalog):** Global product database managed by admins
2. **Shop Products (Inventory):** Individual shop listings linked to master products

### Product Properties
- Basic: name, brand, model, description
- Pricing: base_price
- Media: images array
- Categorization: category_id
- Search helpers: normalized_name, aliases, keywords
- Identifiers: gtin (barcode), mpn (manufacturer part number)
- Status: PENDING, APPROVED, REJECTED, MERGED

### Public Product Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /api/products` | List products with filters, search, pagination |
| `GET /api/products/:id` | Get product details with shop listings |
| `GET /api/products/category/:categoryId` | Get products in category |

### Product Filtering & Search
- Search: name, brand, description (case-insensitive)
- Filter: category_id, brand, is_active, min_price, max_price
- Sort: name, base_price, created_at, updated_at (asc/desc)
- Pagination: page, limit

### Product Matching (for Sellers)
- **Endpoint:** `GET /api/products/match?query=...`
- Uses Fuse.js fuzzy search
- Returns match candidates with confidence scores
- Match types: exact, fuzzy, brand_model, gtin

### Product Request Flow (Sellers)
1. Seller searches for existing product via `/match`
2. If found: Link to existing product when creating shop listing
3. If not found: Submit new product request via `POST /api/products/request`
4. Admin reviews and approves/rejects

### Admin Product Management
| Endpoint | Description |
|----------|-------------|
| `GET /api/products/pending` | Get products awaiting review |
| `POST /api/products/:id/approve` | Approve pending product |
| `POST /api/products/:id/reject` | Reject with reason |
| `POST /api/products/:id/merge` | Merge duplicate into canonical |
| `GET /api/products/:id/duplicates` | Find potential duplicates |
| `POST /api/products` | Create product directly (admin) |
| `PUT /api/products/:id` | Update product |
| `DELETE /api/products/:id` | Soft delete (is_active = false) |

### Product Image Management
- `POST /api/products/:id/images` - Upload images (up to 10)
- `DELETE /api/products/:id/images/:imageIndex` - Delete image
- Images stored in Cloudinary under products folder

---

## Shop Products (Inventory)

### What is a Shop Product?
A shop-specific listing that links to a master product with:
- Custom pricing
- Stock quantity
- Condition (NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, USED_FAIR)
- Shop-specific description and images
- SKU
- Availability status

### Shop Product Endpoints
Base path: `/api/shops/:shopId/products`

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/` | GET | Public | List shop's products |
| `/:shopProductId` | GET | Public | Get product details |
| `/` | POST | Owner/Admin | Add product to shop |
| `/:shopProductId` | PUT | Owner/Admin | Update listing |
| `/:shopProductId` | DELETE | Owner/Admin | Remove (soft delete) |
| `/:shopProductId/stock` | PATCH | Owner/Admin | Quick stock update |
| `/:shopProductId/stock-logs` | GET | Owner/Admin | View stock history |
| `/:shopProductId/images` | POST | Owner/Admin | Upload images |
| `/:shopProductId/images/:index` | DELETE | Owner/Admin | Delete image |

### Stock Management
- Stock changes are logged to `shop_products_log`
- Change types: INCREASE, DECREASE, ADJUSTMENT
- Reason tracking for each change
- Stock reduced on checkout, restored on cancellation

### Adding Products to Shop
1. Seller provides product_id (from master catalog)
2. Sets price, stock_quantity, condition
3. Optionally adds shop-specific description, images, specs
4. System creates shop_product linking shop to product

---

## Shopping Cart

### Cart Implementation
- Cart is an order with status = "CART"
- Separate cart per shop (multi-shop support)
- Cart identified by: buyer_id + shop_id + status="CART"

### Cart Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/cart` | GET | Get all cart items (grouped by shop) |
| `POST /api/cart` | POST | Add item to cart |
| `PUT /api/cart/items/:itemId` | PUT | Update quantity |
| `DELETE /api/cart/items/:itemId` | DELETE | Remove item |
| `DELETE /api/cart` | DELETE | Clear entire cart |

### Add to Cart Flow
1. Verify shop_product exists and is available
2. Check stock availability
3. Get or create cart for shop
4. Check if item already in cart
   - If yes: Update quantity
   - If no: Add new item
5. Recalculate cart total

### Cart Response Structure
```json
{
  "carts": [
    {
      "shop": { "id", "name", "logo" },
      "items": [
        {
          "id": "item_id",
          "product": { "id", "name", "brand", "images" },
          "quantity": 2,
          "unit_price": 50000,
          "total_price": 100000
        }
      ],
      "subtotal": 100000
    }
  ],
  "total_items": 2,
  "grand_total": 100000
}
```

---

## Orders & Checkout

### Order Status Flow
```
CART → PENDING_PAYMENT → CONFIRMED → PREPARING → READY_FOR_PICKUP → DELIVERED
                                  ↘          ↘
                                   OUT_FOR_DELIVERY
                                            ↓
                                       DELIVERED
        
Any → CANCELLED (before DELIVERED)
```

### Checkout Flow
**Endpoint:** `POST /api/orders/checkout`

1. **Validate delivery address** (must belong to user)
2. **Get user's carts** (all shops)
3. **Validate stock** for each item
4. **For each cart:**
   - Generate order number (ORD-YYYY-XXXXXX)
   - Update cart to order status
   - Reserve stock (decrement quantities)
5. **Initiate payment:**
   - PayChangu: Create payment, return checkout URL
   - COD/Bank Transfer: Create payment record with PENDING status
6. **Return order summary** with payment details

### Checkout Request
```json
{
  "delivery_address_id": "uuid",
  "payment_method": "paychangu" | "cod" | "bank_transfer",
  "customer_email": "email@example.com",
  "customer_phone": "+265...",
  "customer_first_name": "John",
  "customer_last_name": "Doe"
}
```

### Order Endpoints
| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/orders/checkout` | POST | User | Create order from cart |
| `/api/orders/my-orders` | GET | User | Get my orders |
| `/api/orders/:orderId` | GET | Owner/Seller/Admin | Get order details |
| `/api/orders/:orderId/tracking` | GET | Owner/Seller/Admin | Get tracking timeline |
| `/api/orders/shop/:shopId` | GET | Shop Owner/Admin | Get shop's orders |
| `/api/orders/:orderId/status` | PATCH | Shop Owner/Admin | Update status |
| `/api/orders/:orderId/cancel` | POST | Owner/Seller/Admin | Cancel order |
| `/api/orders/admin/all` | GET | Admin | Get all orders |
| `/api/orders/stats` | GET | Seller/Admin | Get order statistics |

### Order Cancellation
- Validates order can be cancelled (not DELIVERED/CANCELLED/REFUNDED)
- Restores stock to inventory
- Updates payment status to CANCELLED
- Creates cancellation notification message
- Records who cancelled (buyer/seller)

### Status Update (Seller Workflow)
- Validates allowed state transitions
- Creates notification message for buyer
- Tracks status change timestamp

### Order Tracking
Returns timeline with:
- Status progression
- Completion timestamps
- Notification history

---

## Payments

### PayChangu Integration
Malawian payment gateway supporting mobile money and cards.

### Payment Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/payments/initiate` | POST | Start new payment |
| `POST /api/payments/verify` | POST | Verify payment status |
| `POST /api/payments/webhook` | POST | Webhook from PayChangu |
| `POST /api/payments/report` | POST | Customer payment report |
| `GET /api/payments/my-payments` | GET | User's payment history |
| `GET /api/payments/order/:orderId` | GET | Payments for order |
| `GET /api/payments/:txRef` | GET | Get payment by tx_ref |

### Payment Flow
1. **Initiate:** Generate tx_ref, call PayChangu API, store payment record
2. **User redirected:** To PayChangu checkout URL
3. **Payment completed:** Webhook received OR verification called
4. **Order confirmed:** Status updated to CONFIRMED

### Payment Verification
- Via webhook (automatic, signature verified)
- Via `/verify` endpoint (manual check)
- Via background job (polls pending payments)

### Payment Record
```json
{
  "id": "uuid",
  "order_id": "uuid",
  "payment_method": "mobile_money",
  "provider": "paychangu",
  "amount": 50000,
  "currency": "MWK",
  "status": "PENDING|PAID|FAILED|CANCELLED",
  "tx_ref": "unique-transaction-ref",
  "checkout_url": "https://...",
  "customer_email": "...",
  "customer_phone": "..."
}
```

### Background Payment Job
- Runs every 5 minutes
- Checks pending payments not yet expired
- Verifies status with PayChangu
- Updates payment and order status

---

## Reviews

### Review System
- Reviews are tied to orders and shop_products
- Can only review after order is DELIVERED
- One review per order-product combination

### Review Endpoints
| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `POST /api/reviews` | POST | User | Create review |
| `GET /api/reviews/my-reviews` | GET | User | Get own reviews |
| `GET /api/reviews/shop-product/:id` | GET | Public | Get product reviews |
| `GET /api/reviews/shop/:shopId` | GET | Public | Get shop's reviews |
| `PUT /api/reviews/:reviewId` | PUT | Owner | Update review |
| `DELETE /api/reviews/:reviewId` | DELETE | Owner/Admin | Delete review |

### Review Creation
1. Validate order exists and belongs to user
2. Verify order status is DELIVERED
3. Check shop_product was in the order
4. Ensure no duplicate review exists
5. Create review with rating (1-5) and optional comment

### Review Response
Includes average rating calculations and review counts.

---

## Categories

### Category Management
Simple hierarchical product categorization.

### Category Endpoints
| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `GET /api/categories` | GET | Public | List categories |
| `GET /api/categories/:id` | GET | Public | Get category |
| `GET /api/categories/:id/products` | GET | Public | Get products in category |
| `POST /api/categories` | POST | Admin | Create category |
| `PUT /api/categories/:id` | PUT | Admin | Update category |
| `DELETE /api/categories/:id` | DELETE | Admin | Delete category |

### Category Properties
- name (unique)
- description
- is_active

---

## Addresses

### Delivery Address Management
Users can save multiple delivery addresses.

### Address Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/addresses` | GET | Get my addresses |
| `POST /api/addresses` | POST | Create address |
| `GET /api/addresses/:id` | GET | Get address |
| `PUT /api/addresses/:id` | PUT | Update address |
| `DELETE /api/addresses/:id` | DELETE | Delete address |
| `PUT /api/addresses/:id/set-default` | PUT | Set as default |

### Address Properties
- contact_name
- phone_number
- address_line1
- city
- country (default: Malawi)
- latitude, longitude (optional)
- is_default

### Default Address Logic
- Setting new default clears previous default
- Used as pre-selected option in checkout

---

## Admin Tools

### IP Blocking & Rate Limiting Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/admin/blocked-ips` | GET | List blocked IPs |
| `POST /api/admin/blocked-ips` | POST | Block IP manually |
| `DELETE /api/admin/blocked-ips/:ip` | DELETE | Unblock IP |
| `GET /api/admin/violations/:ip` | GET | Get IP violations |
| `DELETE /api/admin/violations/:ip` | DELETE | Clear violations |
| `GET /api/admin/ip-stats` | GET | Get blocking statistics |

### Block IP Request
```json
{
  "ip": "192.168.1.1",
  "durationMinutes": 60,
  "reason": "Suspicious activity"
}
```

---

## Security Features

### Rate Limiting
- Global: 100 requests per 15 minutes
- Auth endpoints: 5 attempts per 15 minutes
- Implemented with Redis for distributed tracking
- Localhost whitelisted for development

### IP Blocking
- Automatic blocking after repeated violations
- Manual blocking by admins
- Configurable duration
- Violation tracking with reason

### Input Validation
- All endpoints use Zod schemas
- Request body, params, and query validated
- Detailed error messages

### Authentication
- JWT access tokens (short-lived)
- Refresh tokens in Redis (long-lived)
- Token rotation on refresh
- httpOnly cookies for refresh tokens
- Device and IP tracking

### Data Protection
- Passwords hashed with bcrypt
- Sensitive data excluded from responses
- SQL injection prevention via Prisma ORM

---

## Image Upload (Cloudinary)

### Supported Upload Types
| Entity | Max Files | Folder |
|--------|-----------|--------|
| User profile | 1 | users |
| Shop logo | 1 | shops/logos |
| Shop banner | 1 | shops/banners |
| Shop gallery | 10 | shops/gallery |
| Product images | 10 | products |
| Shop product images | 10 | shop-products |

### Upload Flow
1. Multer middleware accepts file(s)
2. Files uploaded to Cloudinary
3. URLs stored in database
4. Old images deleted on replacement

### File Limits
- Max file size: Configured in multer
- Accepted types: Images (validated by Cloudinary)

---

## Background Jobs

### Payment Verification Job
- **Interval:** Every 5 minutes
- **Function:** Check pending payments with PayChangu
- **Updates:** Payment status, order status
- **Logging:** Console output for monitoring

### Graceful Shutdown
- SIGTERM/SIGINT handlers
- Stops background jobs
- Disconnects Redis
- Closes HTTP server

---

## Database Schema Summary

### Core Tables
| Table | Purpose |
|-------|---------|
| users | User accounts |
| shops | Seller stores |
| products | Master product catalog |
| shop_products | Shop inventory listings |
| categories | Product categories |
| orders | Purchase orders (also carts) |
| order_items | Line items in orders |
| payments | Payment records |
| reviews | Product reviews |
| user_addresses | Delivery addresses |
| order_messages | Notification records |
| shop_products_log | Stock change audit trail |
| payment_reports | Customer payment reports |

### Key Relationships
- User → many Shops (seller)
- User → many Orders (buyer)
- Shop → many Shop_Products
- Product → many Shop_Products
- Order → many Order_Items → Shop_Product
- Order → many Payments
- Order → many Reviews

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_ACCESS_SECRET="..."
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# PayChangu
PAYCHANGU_SECRET_KEY="..."
PAYCHANGU_WEBHOOK_SECRET_KEY="..."
PAYCHANGU_CALLBACK_URL="..."
PAYCHANGU_RETURN_URL="..."
PAYCHANGU_DEFAULT_CURRENCY="MWK"
PAYCHANGU_PAYMENT_EXPIRY_MINUTES="59"
```
