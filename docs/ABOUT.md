# What is Sankha v.4?

Sankha v.4 is a **price-comparison marketplace** designed specifically for Malawi's retail landscape. Think of it as the local version of PriceCheck or Google Shopping — but built from the ground up to handle the unique challenges of Malawian commerce.

## The Problem We Solve

In traditional e-commerce platforms, each shop operates like an island. If you want to buy an iPhone, you have to:
1. Visit TechHub's website and check their price
2. Visit Digital World's website and check their price  
3. Visit Gadget Palace's website and check their price
4. Manually compare prices, shipping, and availability

**This is exhausting.** Most buyers either give up or settle for the first decent option they find.

## How Sankha v.4 Works

We flip the model. Instead of visiting multiple shops, buyers visit **one platform** where they can:

1. **Search once** — Type "iPhone 15" and see all shops selling it
2. **Compare instantly** — View prices, conditions, stock status, and shop ratings side by side
3. **Choose wisely** — Pick based on price, location, shop reputation, or fastest delivery
4. **Buy seamlessly** — Checkout and pay through a single unified process

## The Technical Architecture

### Unified Product Catalog
Products exist once in a master database. When a seller wants to list an iPhone 15, they don't create a new "iPhone 15" entry — they link their shop's inventory to the existing product.

**Why this matters:**
- Eliminates duplicate listings
- Makes comparisons accurate (you're comparing the same actual product)
- Keeps the catalog clean and searchable
- Reduces seller workload (less data entry)

### Shop-Specific Listings
While the product is shared, each shop controls:
- **Their price** — Compete on pricing
- **Stock quantity** — Real-time availability
- **Condition** — New, refurbished, used (like new, good, fair)
- **Shop description** — Highlight their specific offering (e.g., "includes free charger")
- **Shop images** — Show their actual inventory

### Example in Action

**Buyer's View:**
```
Search: "MacBook Air M3"

Results:
┌─────────────────────────────────────────────────────┐
│ MacBook Air M3 (13-inch, 256GB)                    │
│ 5 shops selling this                                │
├─────────────────────────────────────────────────────┤
│ Digital World (Lilongwe)    MK 760,000   [New]     │
│ ⭐ 4.8 • In Stock • Delivery Available              │
│                                                     │
│ TechHub (Blantyre)          MK 750,000   [New]     │
│ ⭐ 4.6 • 3 left • Pickup Only                       │
│                                                     │
│ Gadget Depot (Mzuzu)        MK 720,000   [Refurb]  │
│ ⭐ 4.5 • In Stock • Delivery Available              │
└─────────────────────────────────────────────────────┘
```

The buyer can see immediately:
- Who has the best price
- Condition differences
- Stock availability
- Which shops deliver
- Shop reputation

**Seller's View:**
Sellers manage their inventory through their shop dashboard:
- Add products by searching the catalog or requesting new ones
- Set competitive prices
- Track stock levels
- See how their pricing compares to competitors
- Manage orders and customer reviews

## Key Features

### For Buyers
- **Compare prices** across all shops in one search
- **Filter by location** to find nearby shops
- **Read reviews** for both products and shops
- **Track orders** with status updates
- **Save addresses** for quick checkout
- **Mobile money payments** via PayChangu (Airtel Money, TNM Mpamba)

### For Sellers
- **Easy product listing** — Link to existing products or request new ones
- **Inventory management** — Track stock with automatic logging
- **Order management** — Update status, communicate with buyers
- **Image uploads** — Shop branding and product photos
- **Analytics** — See sales stats and performance
- **Shop verification** — Build trust with verified badge

### For Administrators
- **Product approval workflow** — Review new product submissions
- **Duplicate detection** — Merge duplicate products using fuzzy matching
- **User management** — Roles, permissions, account status
- **Shop verification** — Approve business registrations
- **Platform monitoring** — Order stats, payment tracking, IP blocking

## What Makes Sankha v.4 Different

### 1. Price Transparency
Unlike traditional marketplaces where you see one seller at a time, Sankha v.4 shows you **everyone's prices at once**. This creates healthy competition and helps buyers save money.

### 2. Localized for Malawi
- Payment integration with PayChangu (local payment gateway)
- Currency in Malawian Kwacha (MK)
- City-based shop filtering (Lilongwe, Blantyre, Mzuzu, etc.)
- Support for cash on delivery and bank transfers

### 3. Intelligent Product Matching
The system uses fuzzy search algorithms to help sellers link their products correctly, preventing the catalog from becoming cluttered with duplicates.

### 4. Multi-Shop Cart
Buyers can add items from different shops to one cart, checkout once, and the system automatically creates separate orders for each shop.

### 5. Fair Visibility
All shops selling a product get equal visibility in search results. Success depends on competitive pricing, reputation, and service — not who can afford the biggest ads.

## Business Model

Sankha v.4 can monetize through:
- **Commission on sales** — Small percentage of each transaction
- **Premium shop features** — Enhanced analytics, promoted listings, priority support
- **Advertising** — Banner ads, sponsored search results
- **Subscription tiers** — Basic (free), Professional, Enterprise plans for sellers

## Technical Stack

- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Caching:** Redis (rate limiting, session management)
- **Storage:** Cloudinary (images)
- **Payments:** PayChangu API
- **Authentication:** JWT with refresh tokens
- **Security:** Rate limiting, IP blocking, input validation

## Current Status

**Fully Implemented:**
- User authentication and authorization
- Shop creation and management
- Product catalog with approval workflow
- Shopping cart and checkout
- Payment processing via PayChangu
- Order management with status tracking
- Reviews and ratings
- Inventory management with stock logging
- Admin tools and IP blocking

**Planned:**
- Email notifications
- Password reset
- Refund processing
- Wishlist functionality
- Shop verification workflow
- Low stock alerts
- Seller payout system

## Target Users

### Buyers
- Tech-savvy Malawians looking for the best deals
- People who want to compare prices before buying
- Anyone tired of visiting multiple websites or physical stores

### Sellers
- Electronics shops
- Phone retailers
- Computer stores
- Gadget dealers
- Both established businesses and small vendors

### Use Cases

**Urban shoppers:** "I need a laptop. Let me check Sankha v.4 to see which Lilongwe shops have the best price."

**Rural buyers:** "I'm in Mzuzu. Which nearby shops have Samsung phones in stock?"

**Price-conscious students:** "Where's the cheapest place to buy a power bank?"

**Sellers:** "I just got new iPhone stock. Let me list it and see how my prices compare to competitors."

## Why It Will Work

1. **Real need:** Buyers genuinely want to compare prices
2. **Network effects:** More sellers → better prices → more buyers → more sellers
3. **First-mover advantage:** No major price-comparison platform in Malawi yet
4. **Mobile-first market:** Malawi has high mobile penetration, perfect for online marketplaces
5. **Payment infrastructure:** PayChangu makes mobile money integration straightforward

## Vision

Sankha v.4 aims to become **the default starting point** for anyone in Malawi looking to buy electronics or gadgets. Before making a purchase, people will naturally check Sankha v.4 first to see who has the best deal.

Ultimately, we want to:
- Increase price transparency in Malawian retail
- Help small shops compete with larger retailers
- Save buyers time and money
- Build trust through verified shops and genuine reviews
- Expand beyond electronics to other product categories

---

**In one sentence:** Sankha v.4 is the platform where Malawian buyers find the best price, and sellers compete on value rather than visibility.
