# ShopTech Backend

Backend API for ShopTech, a **price-comparison marketplace** built for Malawi. Unlike traditional e-commerce platforms where each shop operates in isolation, ShopTech lets buyers compare prices for the same product across multiple shops — helping them find the best deal while giving sellers fair visibility.

## How It Works

1. **Unified Product Catalog** — Products exist once in a master catalog. When sellers list items, they link to existing products rather than creating duplicates.
2. **Multi-Shop Comparison** — Buyers searching for "iPhone 15" see all shops selling it, with prices, stock, and conditions side by side.
3. **Shop-Specific Listings** — Each shop sets their own price, stock quantity, condition (new/refurbished/used), and can add shop-specific descriptions.
4. **Single Checkout** — Buyers can purchase from any shop through a unified cart and checkout experience.

This architecture makes ShopTech a **"find the best price"** platform rather than just another online store.

## Tech Stack

- Node.js + Express 5
- TypeScript
- PostgreSQL with Prisma ORM
- Redis (rate limiting, caching)
- Cloudinary (image uploads)
- PayChangu (payment gateway)
- JWT authentication with refresh tokens

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Cloudinary account
- PayChangu merchant account

## Getting Started

### 1. Clone and install dependencies

```bash
git clone https://github.com/chifundo365/shop-tech_backend.git
cd shop-tech_backend
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/shoptech?schema=public"

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

# PayChangu
PAYCHANGU_SECRET_KEY="your-paychangu-secret-key"
PAYCHANGU_WEBHOOK_SECRET_KEY="your-webhook-secret"
PAYCHANGU_CALLBACK_URL="http://localhost:3000/api/payments/paychangu/callback"
PAYCHANGU_RETURN_URL="http://localhost:3000/payment/complete"
```

### 3. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed the database (optional)
npm run seed
```

### 4. Run the server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The API will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── config/          # External service configs (Redis, Cloudinary, PayChangu)
├── controllers/     # Request handlers
├── middleware/      # Auth, validation, rate limiting, uploads
├── routes/          # API route definitions
├── schemas/         # Zod validation schemas
├── services/        # Business logic (payments, product matching)
├── types/           # TypeScript type definitions
├── utils/           # Helper functions
├── prismaClient.ts  # Database client
└── server.ts        # Express app entry point

prisma/
├── schema.prisma    # Database schema
├── seed.ts          # Database seeder
└── migrations/      # Migration files
```

## API Routes

All routes are prefixed with `/api`.

| Route | Description |
|-------|-------------|
| `/auth` | Registration, login, logout, token refresh |
| `/users` | User profile management |
| `/shops` | Shop CRUD operations |
| `/products` | Product catalog (with admin approval workflow) |
| `/categories` | Product categories |
| `/cart` | Shopping cart operations |
| `/orders` | Checkout-and order management |
| `/payments` | Payment initiation and webhooks |
| `/reviews` | Product reviews |
| `/addresses` | User delivery addresses |
| `/admin` | Admin operations |

## Database Models

The main entities:

- **users** - Accounts with roles (USER, SELLER, ADMIN, SUPER_ADMIN)
- **shops** - Seller storefronts with location and verification status
- **products** - Global product catalog with approval workflow
- **shop_products** - Shop-specific listings (price, stock, condition)
- **orders** - Purchase orders (also serves as shopping cart when status is CART)
- **order_items** - Line items within orders
- **payments** - Payment records linked to orders
- **reviews** - Product reviews tied to completed orders
- **categories** - Product categories
- **user_addresses** - Delivery addresses

## Authentication

Uses JWT with a dual-token approach:

- **Access token**: Short-lived (15 min default), sent in Authorization header
- **Refresh token**: Long-lived (7 days default), stored in httpOnly cookie

Protected routes require the `Authorization: Bearer <access_token>` header.

## User Roles

| Role | Permissions |
|------|-------------|
| USER | Browse, purchase, review products |
| SELLER | All USER permissions + manage own shop and products |
| ADMIN | All SELLER permissions + approve products, manage users |
| SUPER_ADMIN | Full system access |

## Payment Flow

1. User adds items to cart and proceeds to checkout
2. Order is created with `PENDING_PAYMENT` status
3. PayChangu payment is initiated, returns checkout URL
4. User completes payment on PayChangu
5. Webhook or background job verifies payment
6. Order status updates to `CONFIRMED`

## Product Catalog

The system uses a two-tier product structure:

- **products**: Master catalog of approved products
- **shop_products**: Individual shop listings referencing the master catalog

New products go through an approval workflow (PENDING → APPROVED/REJECTED/MERGED). The product matching service uses fuzzy search to help sellers link their listings to existing catalog items.

## Rate Limiting

- Global: 100 requests per 15 minutes per IP
- Localhost is whitelisted for development
- Blocked IPs are tracked in Redis

## Scripts

```bash
npm run dev      # Start development server with hot reload
npm run build    # Compile TypeScript
npm start        # Run production build
npm run seed     # Seed the database
```

## License

ISC