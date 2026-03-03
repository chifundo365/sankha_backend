# Sankha v.4 Backend

Backend API for Sankha v.4, a **price-comparison marketplace** built for Malawi. Unlike traditional e-commerce platforms where each shop operates in isolation, Sankha v.4 lets buyers compare prices for the same product across multiple shops — helping them find the best deal while giving sellers fair visibility.

## How It Works

1. **Unified Product Catalog** — Products exist once in a master catalog. When sellers list items, they link to existing products rather than creating duplicates.
2. **Multi-Shop Comparison** — Buyers searching for "iPhone 15" see all shops selling it, with prices, stock, and conditions side by side.
3. **Shop-Specific Listings** — Each shop sets their own price, stock quantity, condition (new/refurbished/used), and can add shop-specific descriptions.
4. **Single Checkout** — Buyers can purchase from any shop through a unified cart and checkout experience.
5. **Escrow & Release Codes** — Payments are held in escrow. Buyers receive a 6-character release code; once the seller verifies it on delivery, funds are credited to the seller's wallet.

This architecture makes Sankha v.4 a **"find the best price"** platform rather than just another online store.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ with TypeScript 5.9 |
| Framework | Express 5 |
| Database | PostgreSQL 14+ with Prisma ORM 6.17 |
| Extensions | PostGIS (geographic search), pg_trgm (fuzzy text matching) |
| Cache / Rate Limiting | Redis 6+ |
| Image Uploads | Cloudinary |
| Payments & Payouts | PayChangu |
| Email | Resend |
| SMS | Africa's Talking |
| Fuzzy Matching | Fuse.js (fallback for product matching) |
| Bulk Upload Parsing | ExcelJS + xlsx |
| Scheduling | node-cron |
| Auth | JWT (access + refresh tokens) |

## Requirements

- Node.js 18+
- PostgreSQL 14+ with PostGIS and pg_trgm extensions
- Redis 6+
- Cloudinary account
- PayChangu merchant account
- Resend API key (email)
- Africa's Talking account (SMS, optional)

## Getting Started

### 1. Clone and install dependencies

```bash
git clone https://github.com/chifundo365/sankha_backend.git
cd sankha_backend
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
TZ=Africa/Blantyre

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/sankha_db?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_ACCESS_SECRET="your-access-token-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# PayChangu (Payments & Payouts)
PAYCHANGU_API_BASE="https://api.paychangu.com"
PAYCHANGU_SECRET_KEY="your-paychangu-secret-key"
PAYCHANGU_WEBHOOK_SECRET_KEY="your-webhook-secret"
PAYCHANGU_CALLBACK_URL="http://localhost:3000/api/payments/paychangu/callback"
PAYCHANGU_RETURN_URL="http://localhost:3000/payment/complete"
PAYCHANGU_DEFAULT_CURRENCY="MWK"
PAYCHANGU_PAYMENT_EXPIRY_MINUTES=59

# Email (Resend)
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM_NAME="Sankha"
EMAIL_FROM_ADDRESS="noreply@sankha.mw"
SUPPORT_EMAIL="support@sankha.mw"
APP_LOGO_URL="https://your-cdn.com/logo.png"
SOCIAL_FACEBOOK="https://facebook.com/sankha"
SOCIAL_TWITTER="https://twitter.com/sankha"
SOCIAL_INSTAGRAM="https://instagram.com/sankha"

# SMS (Africa's Talking)
AFRICASTALKING_USERNAME="your-username"
AFRICASTALKING_API_KEY="your-api-key"
AFRICASTALKING_FROM="SANKHA"
AFRICASTALKING_SANDBOX="false"

# Search
SEARCH_SIMILARITY=0.2
DEFAULT_SEARCH_RADIUS_KM=15

# Bulk Upload
BULK_UPLOAD_MAX_ROWS=1000
CATEGORY_FUZZY_THRESHOLD=0.6
FUZZY_MATCH_THRESHOLD=0.8

# Scheduled Jobs
ENABLE_SCHEDULED_CLEANUP=true
CLEANUP_CRON_SCHEDULE="0 0 * * *"
STAGING_RETENTION_HOURS=24
ABANDONED_BATCH_HOURS=48
COMPLETED_BATCH_RETENTION_DAYS=30
```

### 3. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates tables, PostGIS extension, pg_trgm, indexes)
npx prisma migrate deploy

# Seed the database (optional — populates all 22 tables with sample data)
npm run seed
```

### 4. Run the server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

The API will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── config/          # External service configs (Redis, Cloudinary, PayChangu, Email)
├── controllers/     # Request handlers (18 controllers)
├── helpers/         # Utility helpers
├── jobs/            # Scheduled/background jobs (payment verification, cleanup)
├── middleware/      # Auth, authorization, validation, rate limiting, uploads, bulk upload governance
├── models/          # Data models
├── routes/          # API route definitions (16 route files)
├── schemas/         # Zod validation schemas
├── services/        # Business logic (15 services)
├── templates/       # Email templates (7 branded HTML templates)
├── types/           # TypeScript type definitions
├── utils/           # Helper functions
├── prismaClient.ts  # Database client singleton
└── server.ts        # Express app entry point

prisma/
├── schema.prisma    # Database schema (22 models, 21 enums)
├── seed.ts          # Database seeder (all tables)
└── migrations/      # Migration files
```

## API Routes

All routes are prefixed with `/api`.

### Authentication (`/api/auth`) — 11 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | User registration |
| POST | `/login` | — | Login (returns access + refresh tokens) |
| POST | `/refresh` | — | Refresh access token |
| POST | `/logout` | — | Logout (revoke refresh token) |
| POST | `/logout-all` | Bearer | Logout from all devices |
| POST | `/forgot-password` | — | Request password reset email |
| GET | `/verify-reset-token/:token` | — | Verify reset token validity |
| POST | `/reset-password` | — | Reset password with token |
| GET | `/me` | Bearer | Get current user profile |
| GET | `/admin` | Admin | Admin area check |
| GET | `/seller` | Seller | Seller dashboard check |

### Search (`/api/search`) — 1 endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | Unified product search (see [Search System](#search-system)) |

### Products (`/api/products`) — 14 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | List products (filter, search, pagination) |
| GET | `/category/:categoryId` | — | Products by category |
| GET | `/match` | Bearer | Find matching products (seller) |
| POST | `/request` | Bearer | Request new product for approval |
| GET | `/pending` | Admin | Pending product approvals |
| GET | `/:id` | — | Get single product |
| POST | `/:id/approve` | Admin | Approve product |
| POST | `/:id/reject` | Admin | Reject product |
| POST | `/:id/merge` | Admin | Merge duplicate into canonical |
| GET | `/:id/duplicates` | Admin | Find potential duplicates |
| POST | `/` | Admin | Create product directly |
| PUT | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Soft-delete product |
| POST | `/:productId/images` | Admin | Upload product images |

### Shops (`/api/shops`) — 9 endpoints + nested shop products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | List all shops |
| GET | `/my-shops` | Seller | Current user's shops |
| GET | `/:shopId` | — | Get shop by ID |
| POST | `/` | Seller | Create shop |
| PUT | `/:shopId` | Seller | Update shop |
| DELETE | `/:shopId` | Seller | Delete shop |
| PATCH | `/:shopId/verify` | Admin | Verify/unverify shop |
| POST | `/:shopId/logo` | Seller | Upload shop logo |
| POST | `/:shopId/banner` | Seller | Upload shop banner |

### Shop Products (`/api/shops/:shopId/products`) — 22 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | List shop products (public) |
| POST | `/` | Seller | Add product to shop |
| PUT | `/:shopProductId` | Seller | Update shop listing |
| DELETE | `/:shopProductId` | Seller | Remove listing |
| GET | `/:shopProductId` | — | Get single listing (public) |
| PATCH | `/:shopProductId/stock` | Seller | Quick stock update |
| PATCH | `/:shopProductId/specs` | Seller | Update specs/variant values |
| GET | `/:shopProductId/stock-logs` | Seller | Stock change audit log |
| POST | `/:shopProductId/images` | Seller | Upload multiple images |
| POST | `/:shopProductId/image` | Seller | Upload single image |
| DELETE | `/:shopProductId/images/:imageIndex` | Seller | Delete image |
| GET | `/needs-images` | Seller | Products needing images |
| GET | `/needs-specs` | Seller | Products needing specs |
| GET | `/bulk/template` | Seller | Download bulk upload Excel template |
| POST | `/bulk` | Seller | Upload Excel file |
| GET | `/bulk/history` | Seller | Upload history |
| GET | `/bulk/:uploadId` | Seller | Upload details |
| GET | `/bulk/:batchId/preview` | Seller | Preview staged rows |
| POST | `/bulk/:batchId/commit` | Seller | Commit staged batch |
| DELETE | `/bulk/:batchId/cancel` | Seller | Cancel batch |
| GET | `/bulk/:batchId/corrections` | Seller | Download correction file |
| GET | `/bulk/:batchId/corrections/preview` | Seller | Preview corrections |

### Cart (`/api/cart`) — 5 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Bearer | Get cart |
| POST | `/` | Bearer | Add item to cart |
| PUT | `/items/:itemId` | Bearer | Update item quantity |
| DELETE | `/items/:itemId` | Bearer | Remove item |
| DELETE | `/` | Bearer | Clear cart |

### Orders (`/api/orders`) — 14 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checkout` | Bearer | Checkout (cart → order) |
| GET | `/my-orders` | Bearer | Buyer's orders |
| GET | `/admin/all` | Admin | All orders |
| GET | `/stats` | Bearer | Order statistics |
| GET | `/shop/:shopId` | Seller | Shop orders |
| GET | `/:orderId` | Bearer | Single order |
| GET | `/:orderId/tracking` | Bearer | Order tracking timeline |
| PATCH | `/:orderId/status` | Bearer | Update order status |
| POST | `/:orderId/cancel` | Bearer | Cancel order |
| GET | `/:orderId/release-code` | Bearer | Get release code (buyer) |
| POST | `/:orderId/verify-release-code` | Bearer | Verify release code (seller → wallet credit) |
| POST | `/:orderId/generate-release-code` | Admin | Generate release code |
| PATCH | `/:orderId/delivery-location` | — | Update delivery lat/lng |
| POST | `/:orderId/waybill` | Bearer | Upload waybill photo |

### Payments (`/api/payments`) — 7 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/initiate` | — | Initiate PayChangu payment |
| POST | `/verify` | — | Verify payment status |
| POST | `/webhook` | — | PayChangu webhook (signature verified) |
| POST | `/report` | — | Submit payment dispute report |
| GET | `/my-payments` | Bearer | Payment history |
| GET | `/order/:orderId` | Bearer | Payments for an order |
| GET | `/:txRef` | — | Payment by transaction reference |

### Reviews (`/api/reviews`) — 6 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Bearer | Create review |
| GET | `/my-reviews` | Bearer | My reviews |
| GET | `/shop-product/:shopProductId` | — | Reviews for a listing |
| GET | `/shop/:shopId` | — | Reviews for a shop |
| PUT | `/:reviewId` | Bearer | Update review |
| DELETE | `/:reviewId` | Bearer | Delete review |

### Addresses (`/api/addresses`) — 6 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Bearer | Get my addresses |
| POST | `/` | Bearer | Create address |
| GET | `/:addressId` | Bearer | Get address |
| PUT | `/:addressId` | Bearer | Update address |
| DELETE | `/:addressId` | Bearer | Delete address |
| PUT | `/:addressId/set-default` | Bearer | Set default address |

### Users (`/api/users`) — 11 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile` | Bearer | Get my profile |
| PUT | `/profile` | Bearer | Update profile |
| PUT | `/profile/change-password` | Bearer | Change password |
| POST | `/profile/image` | Bearer | Upload profile image |
| DELETE | `/profile/image` | Bearer | Delete profile image |
| GET | `/:userId/public` | — | Public seller profile |
| GET | `/` | Admin | List all users |
| GET | `/:userId` | Admin | Get user by ID |
| PUT | `/:userId/role` | Admin | Update user role |
| PUT | `/:userId/status` | Admin | Activate/deactivate user |
| DELETE | `/:userId` | Super Admin | Delete user |

### Withdrawals (`/api/withdrawals`) — 9 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wallet` | Seller | Wallet summary (balance, pending, history) |
| POST | `/` | Seller | Request withdrawal |
| GET | `/` | Seller | Withdrawal history |
| GET | `/:id` | Seller | Withdrawal details |
| POST | `/:id/cancel` | Seller | Cancel pending withdrawal |
| GET | `/admin/pending` | Admin | All pending withdrawals |
| POST | `/admin/:id/process` | Admin | Process via PayChangu payout |
| POST | `/admin/:id/complete` | Admin | Manually mark complete |
| POST | `/admin/:id/fail` | Admin | Mark withdrawal as failed |

### Seller Inventory (`/api/seller/inventory`) — 6 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/pending-actions` | Seller | Dashboard summary (items needing attention) |
| GET | `/needs-specs` | Seller | Products needing specs |
| GET | `/needs-images` | Seller | Products needing images |
| GET | `/uploads/:batchId/corrections` | Seller | Download correction file |
| GET | `/uploads/:batchId/corrections/preview` | Seller | Preview corrections |
| PATCH | `/products/:shopProductId/specs` | Seller | Update product specs |

### Admin (`/api/admin`) — 11 endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/blocked-ips` | Admin | List blocked IPs |
| POST | `/blocked-ips` | Admin | Manually block an IP |
| DELETE | `/blocked-ips/:ip` | Admin | Unblock IP |
| GET | `/violations/:ip` | Admin | Get violations for IP |
| DELETE | `/violations/:ip` | Admin | Clear violations |
| GET | `/ip-stats` | Admin | IP blocking statistics |
| PATCH | `/shops/:shopId/bulk-upload-permission` | Admin | Toggle bulk upload permission |
| GET | `/bulk-uploads/pending` | Admin | All pending bulk uploads |
| GET | `/bulk-uploads/stats` | Admin | Bulk upload statistics |
| POST | `/bulk-uploads/:batchId/force-commit` | Admin | Force commit batch |
| DELETE | `/bulk-uploads/:batchId/force-cancel` | Admin | Force cancel batch |

## Database Models

22 models across the schema:

| Model | Description |
|-------|-------------|
| **users** | Accounts with roles (USER, SELLER, ADMIN, SUPER_ADMIN) |
| **shops** | Seller storefronts with PostGIS `location`, `wallet_balance`, delivery config, `can_bulk_upload` flag |
| **products** | Canonical product catalog with approval workflow (PENDING → APPROVED/REJECTED/MERGED), specs (JSONB), variant_values (JSONB), aliases, keywords, gtin, mpn |
| **shop_products** | Shop-specific listings with price, stock, condition, listing_status (LIVE/NEEDS_IMAGES/NEEDS_SPECS/BROKEN/PENDING_REVIEW/REJECTED/PAUSED), base_price |
| **shop_products_log** | Stock change audit log (change_qty, change_type, reason) with PostgreSQL trigger |
| **categories** | Product categories with `auto_created` and `needs_review` flags for fuzzy-matched categories |
| **orders** | Purchase orders with full delivery logistics: release_code, delivery lat/lng, depot info, waybill, carrier, delivery_method (HOME_DELIVERY/DEPOT_COLLECTION) |
| **order_items** | Line items with product_name, quantity, unit_price, total_price, base_price |
| **order_messages** | Order notifications: recipient_type (CUSTOMER/SHOP), channel (EMAIL/SMS/PUSH) |
| **payments** | PayChangu payment records: tx_ref, status, checkout_url, verified_by (VERIFY_ENDPOINT/WEBHOOK/BACKGROUND_JOB) |
| **payment_reports** | Customer payment dispute reports |
| **reviews** | Product reviews (rating + comment), unique per order + product |
| **user_addresses** | Delivery addresses with contact_name, lat/lng, is_default |
| **transactions** | Wallet ledger: type (ORDER_CREDIT/PAYOUT/REFUND/ADJUSTMENT), balance_before/balance_after tracking |
| **withdrawals** | Seller payouts: amount, fee, net_amount, payout_method, recipient_phone, provider (Airtel/TNM), status lifecycle |
| **bulk_uploads** | Bulk upload batches: status (PROCESSING/COMPLETED/FAILED/STAGING/CANCELLED), template_type (ELECTRONICS/GENERAL/AUTO) |
| **bulk_upload_staging** | v4.0 staging rows: validation_status, matched_product_id, missing_specs, errors, target_listing_status |
| **tech_spec_rules** | Category-specific spec requirements: required_specs, optional_specs, spec_labels, spec_validations |
| **password_resets** | Hashed reset tokens with 1-hour expiry |
| **search_logs** | Search analytics: query, results_count, filters (JSONB), buyer_has_coords, response_time_ms |
| **spatial_ref_sys** | PostGIS spatial reference system (auto-created) |

## Authentication

Uses JWT with a dual-token approach:

- **Access token**: Short-lived (15 min default), sent in `Authorization: Bearer <token>` header
- **Refresh token**: Long-lived (7 days default), stored in httpOnly cookie and hashed in Redis
- **Multi-device support**: Each device gets its own refresh token; `logout-all` revokes all sessions

Protected routes require the `Authorization: Bearer <access_token>` header.

### Password Reset Flow

1. User sends email to `/auth/forgot-password`
2. Server generates a 32-byte token (SHA-256 hashed for storage), max 3 active tokens per user
3. Reset link emailed via Resend (1-hour expiry)
4. User verifies token at `/auth/verify-reset-token/:token`
5. User submits new password to `/auth/reset-password`

## User Roles

| Role | Permissions |
|------|-------------|
| USER | Browse, search, purchase, review products, manage addresses |
| SELLER | All USER permissions + manage shops, listings, bulk uploads, view wallet/withdrawals |
| ADMIN | All SELLER permissions + approve/reject/merge products, verify shops, manage users, process withdrawals, IP blocking, bulk upload governance |
| SUPER_ADMIN | Full system access including user deletion |

## Search System

The unified search endpoint (`GET /api/search`) provides location-aware product discovery with intelligent radius fallback.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | required | Search query (2–100 chars) |
| `lat` | number | — | Buyer latitude |
| `lng` | number | — | Buyer longitude |
| `radius_km` | number | 15 | Search radius in km (1–500) |
| `brand` | string | — | Filter by brand |
| `model` | string | — | Filter by model |
| `condition` | enum | — | NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, USED_FAIR |
| `min_price` | number | — | Minimum price (MWK) |
| `max_price` | number | — | Maximum price (MWK) |
| `category_id` | uuid | — | Filter by category |
| `specs` | JSON | — | JSONB spec filter (e.g. `{"Storage":"128GB"}`) |
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Results per page (max 50) |

### How It Works

1. **Text matching**: Combines `LIKE` partial matching with pg_trgm `similarity()` and `%` operator against product name, normalized_name, and brand
2. **Location filtering**: If buyer provides lat/lng, filters shops within radius using PostGIS `ST_DWithin` on the `geography` column
3. **Radius fallback**: If 0 results within radius, automatically re-queries without the radius filter and sets `radius_expanded: true` in metadata
4. **Canonical grouping**: Groups all shop listings under their canonical product (handles merged products via `merged_into_id`)
5. **Distance sorting**: When buyer has coordinates, shop listings are sorted nearest-first, then by price
6. **Facets**: Returns aggregated conditions, brands, models, and price range across results
7. **Suggestions**: When 0 results even after fallback, returns up to 5 similar product names

### Response Metadata

```json
{
  "query": "samsung",
  "total_results": 9,
  "buyer_location_provided": true,
  "search_radius_km": 15,
  "radius_expanded": false,
  "suggestions": []
}
```

## Payment Flow

1. User adds items to cart (`POST /api/cart`)
2. User checks out (`POST /api/orders/checkout`) — creates order with `PENDING_PAYMENT` status
3. Payment initiated via PayChangu (`POST /api/payments/initiate`) — returns checkout URL
4. User completes payment on PayChangu
5. Payment verified via webhook, verify endpoint, or background job
6. Order status updates to `CONFIRMED`
7. Seller dispatches order, buyer receives release code via SMS + email
8. On delivery, seller verifies release code (`POST /api/orders/:id/verify-release-code`)
9. Escrow funds credited to seller's wallet via `transactions` ledger

### Dual Pricing

The system applies a markup multiplier of 1.0526 (5.26%: 3% PayChangu fee + 2% Sankha commission). Sellers set a `base_price`; buyers see the calculated display price.

## Escrow & Wallet System

- **Escrow**: Payment is held until delivery is confirmed via release code
- **Release codes**: 6-character codes with 14-day expiry, sent to buyer via SMS and email with Google Maps links to the shop
- **Wallet**: Each shop has a `wallet_balance`; verified release codes trigger `ORDER_CREDIT` transactions
- **Transaction ledger**: Full audit trail with `balance_before` / `balance_after` on every `transactions` record
- **Withdrawals**: Sellers request payouts (min 1,000 MWK, max 5,000,000 MWK); admin processes via PayChangu payout API; auto-detects Airtel/TNM mobile money provider from phone number

## Bulk Upload System (v4.0)

Allows sellers to add many products at once using an Excel template.

### Flow

1. **Download template** — `GET /bulk/template` (3 types: ELECTRONICS, GENERAL, AUTO)
2. **Upload Excel** — `POST /bulk` — server parses rows, validates, and stages them
3. **Preview** — `GET /bulk/:batchId/preview` — review valid/invalid counts, per-row errors
4. **Commit** — `POST /bulk/:batchId/commit` — creates/links master products and shop_products
5. **Corrections** — `GET /bulk/:batchId/corrections` — download Excel file with only invalid rows for re-upload

### Governance

- Shops must have `can_bulk_upload = true` (toggled by admin)
- Max 3 pending batches per shop
- Max rows per upload controlled by `BULK_UPLOAD_MAX_ROWS` (default 1000)
- Batch ownership verified on all operations
- Admin can force-commit or force-cancel any batch
- Bilingual error messages (English + Chichewa)

### Product Matching

When a seller uploads products, the system attempts to match them to existing catalog entries using a multi-step pipeline:

1. **Exact normalized name match**
2. **pg_trgm similarity scoring**
3. **Fuse.js fuzzy matching** (fallback)
4. **Brand + category matching**
5. **Keyword/alias matching**

Scores include verified product boost (+15%), exact match boost (+10%), and brand/category boosts.

### Category Auto-Creation

If no category match is found during upload, the system auto-creates a category marked `auto_created` and `needs_review` (not active) and surfaces it in the staging preview for seller/admin review.

### Listing Status

Products created by bulk upload start with `listing_status: NEEDS_IMAGES` and are not visible to buyers until images and required specs are added. The seller inventory dashboard surfaces these for action.

## Stock Logging

Stock changes are tracked via a PostgreSQL trigger on `shop_products`. Every stock update records:

- `change_qty` — amount changed
- `change_type` — INCREASE, DECREASE, or ADJUSTMENT
- `reason` — set via the `app.stock_change_reason` session variable

History is viewable at `GET /api/shops/:shopId/products/:shopProductId/stock-logs`.

## Tech Spec Validation

Category-specific spec rules stored in `tech_spec_rules`:

- **Required specs**: Must be provided (e.g. Storage, RAM, Screen Size for smartphones)
- **Optional specs**: Suggested but not required
- **Spec labels**: Display-friendly names
- **Normalization**: Automatic normalization for memory (GB/TB), storage, screen size values
- **Caching**: Rules cached with 5-minute TTL

## Notifications

### Email (Resend)

7 branded HTML templates with Sankha branding:

| Template | Trigger |
|----------|---------|
| Order Confirmation | Checkout — includes release code, Google Maps link, order summary |
| Seller Payout | Order placed — dispatch command center with buyer contact/maps, itemized waybill |
| Password Reset | Forgot password — reset link with 1-hour expiry |
| Welcome | Registration |
| Verification Code | Email verification |
| Notification | Generic (info/success/warning/error) |
| Bulk Upload Summary | After batch processing — counts, first errors |

### SMS (Africa's Talking)

GSM-7 messages (≤160 chars) for:
- Buyer release code delivery
- Seller order notification

Supports sandbox mode for development.

## Rate Limiting & Security

- **Rate limiter**: Redis-based sliding window, 100 requests per 15 minutes per IP
- **Strict rate limiter**: Tighter limits on auth endpoints (login, register, forgot-password)
- **IP blocking**: Progressive blocking (15 min base → 24 hour max, 2× multiplier) on repeated violations
- **Localhost whitelist**: Development bypass for rate limits and IP blocking
- **Admin controls**: Manual block/unblock, view violations, clear violations, blocking statistics

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| **Bulk Upload Cleanup** | Daily at midnight (configurable) | Deletes stale staging rows, cancels abandoned batches, removes old completed batches |
| **Payment Verification** | 1-minute interval | Marks expired payments as FAILED, restores stock, verifies pending payments against PayChangu API |

## Middleware

| Middleware | Description |
|-----------|-------------|
| `protect` | JWT Bearer token verification, attaches `req.user` |
| `authorize` | Role-based access control (accepts allowed roles) |
| `rateLimiter` | Redis sliding-window rate limiter with `X-RateLimit-*` headers |
| `ipBlocker` | Progressive IP blocking with Redis |
| `validateResource` | Zod schema validation for body, query, params |
| `uploadSingle` | Multer single image upload (5MB) |
| `uploadMultiple` | Multer multiple images (5 × 5MB) |
| `uploadGallery` | Multer gallery upload (10 images) |
| `uploadExcel` | Multer Excel upload (10MB, xlsx/xls/csv) |
| `canBulkUpload` | Checks shop bulk upload permission + ownership |
| `verifyBatchOwnership` | Verifies batch belongs to shop |
| `checkPendingBatchLimit` | Max 3 pending batches per shop |

## Scripts

```bash
npm run dev      # Start development server with hot reload (ts-node-dev)
npm run build    # Compile TypeScript to dist/
npm start        # Run production build (node dist/server.js)
npm run seed     # Seed all 22 database tables with sample data
```

## License

ISC
