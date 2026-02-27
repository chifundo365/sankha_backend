# Sankha (formerly Shoptech) — Product & Technical Summary

**Role & Timeline:** 09/2025 – present

Sankha is a price-comparison marketplace for tech products that lets buyers discover items, compare shop-level prices and stock, and complete purchases using PayChangu. Built to increase market transparency and seller visibility, Sankha replaces fragmented shop listings with a unified product catalog and shop-specific listings.

Key Responsibilities
- Architected and implemented the backend REST API using `Node.js` + `Express` and TypeScript.
- Modeled and implemented a master product catalog and `shop_products` listings using `Prisma` ORM and PostgreSQL.
- Built robust authentication using JWT access/refresh tokens and protected middleware for roles (`USER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`).
- Integrated Cloudinary for image storage, and `multer` for upload handling with staged validation workflows.
- Integrated PayChangu for payment initiation and webhook verification; implemented payment verification jobs and reconciliation flows.
- Integrated Google Maps APIs to support shop geolocation and location-based search results.
- Implemented a bulk-upload pipeline (Excel templates) using `exceljs` / `xlsx` for high-volume seller onboarding and catalog population.
- Implemented search and fuzzy matching with `fuse.js` and indexing strategies to link seller listings to master products.
- Added Redis-based caching and rate-limiting to protect endpoints and improve performance.
- Designed admin workflows for product approval, bulk-upload management, and seller verification.

Key Achievements
- Delivered a production-ready, multi-shop comparison platform that allows buyers to find the best price and sellers to list once and surface across the marketplace.
- Built a fault-tolerant checkout flow with PayChangu integration and background payment verification to ensure accurate order state transitions.
- Reduced seller onboarding friction by designing the bulk-upload staging/preview/commit flow with per-row validation and error reporting.
- Implemented a modular image upload and processing pipeline that marks listings as `NEEDS_IMAGES` and supports staged review before public listing.
- Created clear role-based access controls and refresh-token strategy for secure, scalable authentication.

Technical Stack & Notable Libraries
- Backend: `Node.js` (v18+), `Express` 5, TypeScript
- ORM & DB: `Prisma` + PostgreSQL
- Caching & Jobs: Redis, `node-cron` for scheduled jobs
- File storage: Cloudinary (via `cloudinary` SDK) with `multer` for multipart uploads
- Payments: PayChangu (checkout initiation + webhooks)
- Auth: `jsonwebtoken` (JWT access + refresh tokens)
- Search & Matching: `fuse.js` for fuzzy matching and product linking
- Bulk upload: `exceljs`, `xlsx` (staging + validation + commit pipeline)
- Utilities: `axios`, `uuid`, `bcrypt` for password hashing, `zod` for validation
- Dev tooling: `prisma`, `ts-node-dev`, `nodemon`, TypeScript
- Frontend (integrated): React + TypeScript (separate repo/front-end integration)

Why this project stands out (resume-ready phrasing)
- Built a scalable multi-vendor price-comparison platform solving product duplication and fragmented listings.
- Implemented end-to-end payment integration with webhook-based verification to ensure transactional integrity.
- Designed and shipped a bulk-upload system enabling sellers to onboard thousands of listings with staged validation and quality gates.
- Engineered a resilient image and content workflow using Cloudinary that enforces visibility rules until listings are complete.

Further reading
- System architecture, APIs, and guides are documented in this repository's `docs` folder (see `BULK_UPLOAD_V4_IMPLEMENTATION.md`, `IMAGE_UPLOAD_API.md`, and `PAYMENT`-related docs).

(Formerly called *Shoptech*; rebranded to Sankha.)
