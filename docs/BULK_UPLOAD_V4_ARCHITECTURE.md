# Bulk Upload System v4.0 - Architecture Design Document

> **Project**: Sankha (Malawi Price Comparison Marketplace)  
> **Role**: Lead Backend Architect & Node.js Developer  
> **Version**: 4.0 (Parent-Child Architecture with Deferred Completion)  
> **Status**: Design Phase  
> **Last Updated**: February 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Architecture](#proposed-architecture)
4. [Database Schema Design](#database-schema-design)
5. [Processing Flow](#processing-flow)
6. [Template System](#template-system)
7. [Validation Engine](#validation-engine)
8. [Status State Machine](#status-state-machine)
9. [API Endpoints](#api-endpoints)
10. [CLI Commands](#cli-commands)
11. [Governance & Safety](#governance--safety)
12. [Sample Payloads](#sample-payloads)
13. [Implementation Plan](#implementation-plan)
14. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### Objective

Upgrade the existing Bulk Upload system from v3.x to v4.0, introducing:

1. **Parent-Child Architecture**: Base Product (master catalog) → Shop Product (merchant variant)
2. **Deferred Completion**: Products can go live with incomplete specs, completed over time
3. **Staging Pipeline**: Preview → Validate → Correct → Commit workflow
4. **Smart Validation**: Category-aware spec requirements
5. **Governance Controls**: Admin ability to restrict bulk upload access

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Price Comparison Ready** | Multiple sellers can list the same base product |
| **Seller Flexibility** | Don't block uploads for missing specs |
| **Data Quality** | Structured validation with correction workflow |
| **Admin Control** | Governance flags and batch management |
| **Scalability** | Staging table prevents bad data in production |

---

## Current State Analysis

### Existing Architecture (v3.x)

The current system already has a Parent-Child structure:

```
┌─────────────────────┐         ┌─────────────────────┐
│      products       │ 1 ──< N │    shop_products    │
│  (Base Catalog)     │         │  (Merchant Listings)│
├─────────────────────┤         ├─────────────────────┤
│ id                  │         │ id                  │
│ name                │         │ shop_id             │
│ normalized_name     │         │ product_id ────────►│
│ brand               │         │ sku                 │
│ category_id         │         │ base_price          │
│ base_price          │         │ price (display)     │
│ status              │         │ stock_quantity      │
│ images              │         │ condition           │
└─────────────────────┘         │ shop_description    │
                                │ specs (JSONB)       │
                                │ images              │
                                │ listing_status      │
                                └─────────────────────┘
```

### What's Missing (Gap Analysis)

| Gap | Current State | v4.0 Target |
|-----|---------------|-------------|
| Spec Templates | No category-based validation | `specs_template` on products |
| Variant Storage | Flat `specs` JSONB | Structured `variant_values` JSONB |
| Granular Status | `NEEDS_IMAGES` only | `LIVE`, `NEEDS_IMAGES`, `NEEDS_SPECS`, `BROKEN` |
| Staging | Direct to production | Staging → Preview → Commit |
| Governance | None | `can_bulk_upload` flag on shops |
| Correction Flow | Manual re-upload | Correction CSV generator |
| Tech Validation | None | Category-aware required specs |

---

## Proposed Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BULK UPLOAD v4.0 ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │   Excel/CSV      │
                              │   Upload         │
                              └────────┬─────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            STAGING LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    bulk_upload_staging                               │   │
│  │  - Raw data preserved                                                │   │
│  │  - Validation results stored                                         │   │
│  │  - Errors captured per row                                           │   │
│  │  - Batch grouping                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
            │   PREVIEW   │    │  CORRECTION │    │   COMMIT    │
            │   Endpoint  │    │  CSV Export │    │   Action    │
            └─────────────┘    └─────────────┘    └──────┬──────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION LAYER                                  │
│                                                                             │
│   ┌─────────────────┐              ┌─────────────────────────────────────┐ │
│   │    products     │◄─────────────│         shop_products               │ │
│   │  (Base Catalog) │   references │       (Merchant Variants)           │ │
│   │                 │              │                                     │ │
│   │ specs_template  │              │  variant_values (JSONB)             │ │
│   │ (JSONB)         │              │  listing_status (Enum)              │ │
│   │                 │              │  error_reason (String)              │ │
│   └─────────────────┘              └─────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  tech_spec_rules │
                              │  (Validation DB) │
                              └──────────────────┘
```

### Design Principles

1. **Never Block on Missing Data**: Products with missing specs can still be created (status: `NEEDS_SPECS`)
2. **Staging First**: All uploads go to staging before production
3. **Category-Aware**: Tech products require specific specs
4. **Audit Everything**: Preserve raw data, track all errors
5. **Seller-Friendly**: Correction CSV allows easy fixes

---

## Database Schema Design

### Complete Prisma Schema Updates

```prisma
// ============================================================================
// BULK UPLOAD v4.0 - PRISMA SCHEMA UPDATES
// ============================================================================

// ----------------------------------------------------------------------------
// PRODUCTS (Base Catalog) - UPDATED
// ----------------------------------------------------------------------------
model products {
  id              String   @id @default(uuid()) @db.Uuid
  name            String   @db.VarChar(255)
  normalized_name String   @db.VarChar(255)
  brand           String?  @db.VarChar(100)
  category_id     String?  @db.Uuid
  
  // Base price (reference price, may not be used directly)
  base_price      Decimal? @db.Decimal(12, 2)
  
  // Product images (global/canonical images)
  images          Json     @default("[]") @db.JsonB
  
  // Product approval status
  status          ProductStatus @default(PENDING)
  
  // NEW v4.0: Spec template defining what specs this product type should have
  // Example: {"ram": "required", "storage": "required", "color": "optional"}
  specs_template  Json?    @db.JsonB
  
  // Timestamps
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @db.Timestamptz
  
  // Relations
  categories      categories?      @relation(fields: [category_id], references: [id])
  shop_products   shop_products[]
  
  // Indexes
  @@index([normalized_name])
  @@index([category_id])
  @@index([status])
  
  @@map("products")
}

enum ProductStatus {
  PENDING   // Awaiting admin approval
  APPROVED  // Live in catalog
  REJECTED  // Admin rejected
  
  @@map("product_status")
}

// ----------------------------------------------------------------------------
// SHOP PRODUCTS (Merchant Variants) - UPDATED
// ----------------------------------------------------------------------------
model shop_products {
  id                String   @id @default(uuid()) @db.Uuid
  shop_id           String   @db.Uuid
  product_id        String   @db.Uuid
  
  // Merchant's SKU (unique per shop)
  sku               String?  @db.VarChar(50)
  
  // Pricing
  base_price        Decimal  @db.Decimal(12, 2)  // Seller's net price
  display_price     Decimal  @db.Decimal(12, 2)  // base_price * 1.0526
  
  // Inventory
  stock_quantity    Int      @default(0)
  
  // Product condition
  condition         ProductCondition @default(NEW)
  
  // Merchant's description
  shop_description  String?  @db.Text
  
  // NEW v4.0: Structured variant/spec values
  // Example: {"ram": "8GB", "storage": "256GB", "color": "Black"}
  variant_values    Json?    @db.JsonB
  
  // Merchant's product images
  images            Json     @default("[]") @db.JsonB
  
  // NEW v4.0: Granular listing status
  listing_status    ListingStatus @default(NEEDS_SPECS)
  
  // NEW v4.0: Error reason (why it's BROKEN)
  error_reason      String?  @db.Text
  
  // Availability flag (false until ready)
  is_available      Boolean  @default(false)
  
  // Link to bulk upload batch
  bulk_upload_id    String?  @db.Uuid
  
  // Timestamps
  created_at        DateTime @default(now()) @db.Timestamptz
  updated_at        DateTime @updatedAt @db.Timestamptz
  
  // Relations
  shops             shops           @relation(fields: [shop_id], references: [id], onDelete: Cascade)
  products          products        @relation(fields: [product_id], references: [id], onDelete: Cascade)
  bulk_uploads      bulk_uploads?   @relation(fields: [bulk_upload_id], references: [id])
  
  // Indexes
  @@unique([shop_id, sku])
  @@unique([shop_id, product_id])
  @@index([shop_id, listing_status])
  @@index([listing_status])
  @@index([product_id])
  
  @@map("shop_products")
}

enum ProductCondition {
  NEW
  REFURBISHED
  USED_LIKE_NEW
  USED_GOOD
  USED_FAIR
  
  @@map("product_condition")
}

// NEW v4.0: Granular listing status
enum ListingStatus {
  LIVE          // Ready for buyers, fully complete
  NEEDS_IMAGES  // Specs complete, waiting for images
  NEEDS_SPECS   // Has basic data, missing required specs
  BROKEN        // Invalid data, cannot proceed
  INACTIVE      // Seller manually disabled
  OUT_OF_STOCK  // Auto-set when stock = 0
  
  @@map("listing_status")
}

// ----------------------------------------------------------------------------
// SHOPS - UPDATED
// ----------------------------------------------------------------------------
model shops {
  id                String   @id @default(uuid()) @db.Uuid
  name              String   @db.VarChar(255)
  slug              String   @unique @db.VarChar(255)
  description       String?  @db.Text
  logo_url          String?  @db.VarChar(500)
  banner_url        String?  @db.VarChar(500)
  owner_id          String   @db.Uuid
  
  // Contact info
  phone             String?  @db.VarChar(20)
  email             String?  @db.VarChar(255)
  address           String?  @db.Text
  
  // Status
  is_active         Boolean  @default(true)
  is_verified       Boolean  @default(false)
  
  // NEW v4.0: Governance flag
  can_bulk_upload   Boolean  @default(true)  // Admin can disable for bad actors
  
  // Timestamps
  created_at        DateTime @default(now()) @db.Timestamptz
  updated_at        DateTime @updatedAt @db.Timestamptz
  
  // Relations
  users             users           @relation(fields: [owner_id], references: [id])
  shop_products     shop_products[]
  bulk_uploads      bulk_uploads[]
  
  @@map("shops")
}

// ----------------------------------------------------------------------------
// BULK UPLOADS (Tracking) - UPDATED
// ----------------------------------------------------------------------------
model bulk_uploads {
  id            String   @id @default(uuid()) @db.Uuid
  shop_id       String   @db.Uuid
  file_name     String   @db.VarChar(255)
  
  // Counts
  total_rows    Int      @default(0)
  successful    Int      @default(0)
  failed        Int      @default(0)
  skipped       Int      @default(0)
  
  // NEW v4.0: Additional counts
  needs_specs   Int      @default(0)
  needs_images  Int      @default(0)
  
  // Error details
  errors        Json?    @db.JsonB
  
  // Processing status
  status        BulkUploadStatus @default(STAGING)
  
  // NEW v4.0: Batch ID for staging rows
  batch_id      String?  @db.VarChar(50)
  
  // Timestamps
  completed_at  DateTime? @db.Timestamptz
  created_at    DateTime  @default(now()) @db.Timestamptz
  
  // Relations
  shops         shops           @relation(fields: [shop_id], references: [id], onDelete: Cascade)
  shop_products shop_products[]
  staging_rows  bulk_upload_staging[]
  
  @@index([shop_id])
  @@index([status])
  
  @@map("bulk_uploads")
}

// NEW v4.0: Upload status
enum BulkUploadStatus {
  STAGING      // In staging, not committed
  PROCESSING   // Being validated/committed
  COMPLETED    // Successfully committed
  FAILED       // Failed to process
  CANCELLED    // User cancelled
  
  @@map("bulk_upload_status")
}

// ----------------------------------------------------------------------------
// NEW v4.0: BULK UPLOAD STAGING
// ----------------------------------------------------------------------------
model bulk_upload_staging {
  id                String   @id @default(uuid()) @db.Uuid
  
  // Batch reference
  batch_id          String   @db.VarChar(50)  // Groups rows from same upload
  bulk_upload_id    String?  @db.Uuid
  shop_id           String   @db.Uuid
  
  // Row tracking
  row_number        Int      // Excel row number (for error reporting)
  
  // Raw data (preserved exactly as uploaded)
  raw_data          Json     @db.JsonB
  
  // Parsed/normalized data
  product_name      String?  @db.VarChar(255)
  normalized_name   String?  @db.VarChar(255)
  category_name     String?  @db.VarChar(100)
  brand             String?  @db.VarChar(100)
  sku               String?  @db.VarChar(50)
  base_price        Decimal? @db.Decimal(12, 2)
  display_price     Decimal? @db.Decimal(12, 2)
  stock_quantity    Int?
  condition         String?  @db.VarChar(20)
  description       String?  @db.Text
  
  // Parsed variant values
  variant_values    Json?    @db.JsonB
  
  // Template type detected
  template_type     TemplateType @default(GENERAL)
  
  // Validation results
  validation_status StagingValidationStatus @default(PENDING)
  
  // Product matching
  matched_product_id String? @db.Uuid  // If found existing product
  will_create_product Boolean @default(false)  // Will create new base product
  
  // Spec validation results
  missing_specs     Json?    @db.JsonB  // Array of missing required specs
  
  // Error details
  errors            Json?    @db.JsonB  // Array of validation errors
  
  // Determined listing status (if committed)
  target_listing_status ListingStatus?
  
  // Timestamps
  created_at        DateTime @default(now()) @db.Timestamptz
  processed_at      DateTime? @db.Timestamptz
  
  // Relations
  bulk_uploads      bulk_uploads? @relation(fields: [bulk_upload_id], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([batch_id])
  @@index([shop_id, batch_id])
  @@index([validation_status])
  
  @@map("bulk_upload_staging")
}

enum TemplateType {
  ELECTRONICS  // Spec: prefixed columns
  GENERAL      // Label_x/Value_x columns
  AUTO         // Auto-detected
  
  @@map("template_type")
}

enum StagingValidationStatus {
  PENDING     // Not yet validated
  VALID       // Ready to commit
  INVALID     // Has errors, needs correction
  COMMITTED   // Already moved to shop_products
  SKIPPED     // Skipped (duplicate, etc.)
  
  @@map("staging_validation_status")
}

// ----------------------------------------------------------------------------
// NEW v4.0: TECH SPEC RULES
// ----------------------------------------------------------------------------
model tech_spec_rules {
  id              String   @id @default(uuid()) @db.Uuid
  
  // Category reference
  category_id     String   @unique @db.Uuid
  category_name   String   @db.VarChar(100)  // Denormalized for easy lookup
  
  // Required specs (must have for LIVE status)
  // Example: ["ram", "storage", "screen_size"]
  required_specs  Json     @db.JsonB
  
  // Optional specs (nice to have)
  // Example: ["color", "warranty", "weight"]
  optional_specs  Json     @default("[]") @db.JsonB
  
  // Spec labels (human-readable names)
  // Example: {"ram": "RAM", "storage": "Storage Capacity", "screen_size": "Screen Size"}
  spec_labels     Json     @default("{}") @db.JsonB
  
  // Spec validation rules
  // Example: {"ram": {"type": "string", "pattern": "^\\d+GB$"}}
  spec_validations Json?   @db.JsonB
  
  // Is this category active for spec enforcement?
  is_active       Boolean  @default(true)
  
  // Timestamps
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @db.Timestamptz
  
  // Relations
  categories      categories @relation(fields: [category_id], references: [id])
  
  @@map("tech_spec_rules")
}

// ----------------------------------------------------------------------------
// CATEGORIES - UPDATED (add relation)
// ----------------------------------------------------------------------------
model categories {
  id              String   @id @default(uuid()) @db.Uuid
  name            String   @db.VarChar(100)
  slug            String   @unique @db.VarChar(100)
  description     String?  @db.Text
  image_url       String?  @db.VarChar(500)
  parent_id       String?  @db.Uuid
  is_active       Boolean  @default(true)
  sort_order      Int      @default(0)
  
  // Timestamps
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @db.Timestamptz
  
  // Relations
  parent          categories?  @relation("CategoryToCategory", fields: [parent_id], references: [id])
  children        categories[] @relation("CategoryToCategory")
  products        products[]
  
  // NEW v4.0: Tech spec rules
  tech_spec_rules tech_spec_rules?
  
  @@map("categories")
}
```

### SQL Migration Script

```sql
-- ============================================================================
-- BULK UPLOAD v4.0 - DATABASE MIGRATION
-- ============================================================================

-- 1. Add new columns to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS specs_template JSONB;

COMMENT ON COLUMN products.specs_template IS 
'Template defining required/optional specs for this product type. 
Example: {"ram": "required", "storage": "required", "color": "optional"}';

-- 2. Add new columns to shop_products
ALTER TABLE shop_products 
ADD COLUMN IF NOT EXISTS variant_values JSONB,
ADD COLUMN IF NOT EXISTS error_reason TEXT;

-- Migrate existing specs to variant_values
UPDATE shop_products 
SET variant_values = specs 
WHERE specs IS NOT NULL AND variant_values IS NULL;

COMMENT ON COLUMN shop_products.variant_values IS 
'Structured variant/spec values. Example: {"ram": "8GB", "storage": "256GB"}';

COMMENT ON COLUMN shop_products.error_reason IS 
'Why this listing has BROKEN status';

-- 3. Update listing_status enum (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
        CREATE TYPE listing_status AS ENUM (
            'LIVE',
            'NEEDS_IMAGES',
            'NEEDS_SPECS',
            'BROKEN',
            'INACTIVE',
            'OUT_OF_STOCK'
        );
    ELSE
        -- Add new values if enum exists
        ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'LIVE';
        ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'NEEDS_SPECS';
        ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'BROKEN';
    END IF;
END $$;

-- 4. Add governance column to shops
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS can_bulk_upload BOOLEAN DEFAULT true;

COMMENT ON COLUMN shops.can_bulk_upload IS 
'Admin can set to false to prevent shop from using bulk upload';

-- 5. Update bulk_uploads table
ALTER TABLE bulk_uploads 
ADD COLUMN IF NOT EXISTS needs_specs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS needs_images INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50);

-- Update status enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bulk_upload_status') THEN
        CREATE TYPE bulk_upload_status AS ENUM (
            'STAGING',
            'PROCESSING',
            'COMPLETED',
            'FAILED',
            'CANCELLED'
        );
    END IF;
END $$;

-- 6. Create staging table
CREATE TABLE IF NOT EXISTS bulk_upload_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(50) NOT NULL,
    bulk_upload_id UUID REFERENCES bulk_uploads(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    row_number INT NOT NULL,
    
    raw_data JSONB NOT NULL,
    
    product_name VARCHAR(255),
    normalized_name VARCHAR(255),
    category_name VARCHAR(100),
    brand VARCHAR(100),
    sku VARCHAR(50),
    base_price DECIMAL(12,2),
    display_price DECIMAL(12,2),
    stock_quantity INT,
    condition VARCHAR(20),
    description TEXT,
    
    variant_values JSONB,
    template_type VARCHAR(20) DEFAULT 'GENERAL',
    
    validation_status VARCHAR(20) DEFAULT 'PENDING',
    matched_product_id UUID,
    will_create_product BOOLEAN DEFAULT false,
    missing_specs JSONB,
    errors JSONB,
    target_listing_status VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_staging_batch ON bulk_upload_staging(batch_id);
CREATE INDEX idx_staging_shop_batch ON bulk_upload_staging(shop_id, batch_id);
CREATE INDEX idx_staging_status ON bulk_upload_staging(validation_status);

COMMENT ON TABLE bulk_upload_staging IS 
'Temporary staging table for bulk uploads before commit to production';

-- 7. Create tech spec rules table
CREATE TABLE IF NOT EXISTS tech_spec_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID UNIQUE NOT NULL REFERENCES categories(id),
    category_name VARCHAR(100) NOT NULL,
    required_specs JSONB NOT NULL DEFAULT '[]',
    optional_specs JSONB DEFAULT '[]',
    spec_labels JSONB DEFAULT '{}',
    spec_validations JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tech_spec_rules IS 
'Defines required/optional specs for tech product categories';

-- 8. Seed tech spec rules for common categories
INSERT INTO tech_spec_rules (category_id, category_name, required_specs, optional_specs, spec_labels)
SELECT 
    id,
    name,
    CASE 
        WHEN LOWER(name) = 'smartphones' THEN '["ram", "storage", "screen_size"]'::jsonb
        WHEN LOWER(name) = 'laptops' THEN '["ram", "storage", "processor", "screen_size"]'::jsonb
        WHEN LOWER(name) = 'tablets' THEN '["ram", "storage", "screen_size"]'::jsonb
        WHEN LOWER(name) = 'tvs' OR LOWER(name) = 'televisions' THEN '["screen_size", "resolution"]'::jsonb
        WHEN LOWER(name) = 'cameras' THEN '["megapixels", "sensor_type"]'::jsonb
        ELSE '[]'::jsonb
    END,
    CASE 
        WHEN LOWER(name) IN ('smartphones', 'laptops', 'tablets') THEN '["color", "warranty", "weight"]'::jsonb
        ELSE '["color", "warranty"]'::jsonb
    END,
    CASE 
        WHEN LOWER(name) = 'smartphones' THEN '{"ram": "RAM", "storage": "Storage", "screen_size": "Screen Size"}'::jsonb
        WHEN LOWER(name) = 'laptops' THEN '{"ram": "RAM", "storage": "Storage", "processor": "Processor", "screen_size": "Screen Size"}'::jsonb
        ELSE '{}'::jsonb
    END
FROM categories
WHERE LOWER(name) IN ('smartphones', 'laptops', 'tablets', 'tvs', 'televisions', 'cameras')
ON CONFLICT (category_id) DO NOTHING;

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shop_products_variant_values 
ON shop_products USING GIN (variant_values);

CREATE INDEX IF NOT EXISTS idx_products_specs_template 
ON products USING GIN (specs_template);
```

---

## Processing Flow

### Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BULK UPLOAD v4.0 - COMPLETE FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 1: UPLOAD & STAGING                                                   ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  [Seller] ──POST /api/shops/:shopId/products/bulk──> [Server]               ║
║                                                                             ║
║  Server Actions:                                                            ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │ 1. GOVERNANCE CHECK                                                 │   ║
║  │    └── IF shop.can_bulk_upload === false → 403 Forbidden            │   ║
║  │                                                                     │   ║
║  │ 2. FILE VALIDATION                                                  │   ║
║  │    ├── Check file exists                                            │   ║
║  │    ├── Check file type (.xlsx, .csv)                                │   ║
║  │    └── Check row count <= 500 (configurable)                        │   ║
║  │                                                                     │   ║
║  │ 3. GENERATE BATCH ID                                                │   ║
║  │    └── batch_id = `${shopId.slice(0,8)}-${timestamp}-${random}`     │   ║
║  │                                                                     │   ║
║  │ 4. CREATE BULK_UPLOAD RECORD                                        │   ║
║  │    └── status = 'STAGING'                                           │   ║
║  │                                                                     │   ║
║  │ 5. DETECT TEMPLATE TYPE                                             │   ║
║  │    ├── IF has "Spec:" columns → ELECTRONICS                         │   ║
║  │    ├── IF has "Label_x" columns → GENERAL                           │   ║
║  │    └── ELSE → AUTO (infer from category)                            │   ║
║  │                                                                     │   ║
║  │ 6. PARSE & INSERT TO STAGING                                        │   ║
║  │    └── Each row → bulk_upload_staging record                        │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                             ║
║  Response:                                                                  ║
║  {                                                                          ║
║    "batch_id": "a1b2c3d4-1706745600-x7y8z9",                               ║
║    "upload_id": "uuid",                                                     ║
║    "total_rows": 50,                                                        ║
║    "template_type": "ELECTRONICS",                                          ║
║    "status": "STAGING",                                                     ║
║    "next_step": "GET /api/shops/:shopId/bulk/:batchId/validate"            ║
║  }                                                                          ║
╚═════════════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 2: VALIDATION                                                         ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  [Seller] ──POST /api/shops/:shopId/bulk/:batchId/validate──> [Server]      ║
║                                                                             ║
║  OR triggered automatically after upload (configurable)                     ║
║                                                                             ║
║  For Each Staging Row:                                                      ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │                     VALIDATION PIPELINE                             │   ║
║  ├─────────────────────────────────────────────────────────────────────┤   ║
║  │                                                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 1: REQUIRED FIELD VALIDATION                             │ │   ║
║  │  │                                                               │ │   ║
║  │  │ Check:                                                        │ │   ║
║  │  │   • product_name is not empty                                 │ │   ║
║  │  │   • base_price is a positive number                           │ │   ║
║  │  │   • stock_quantity is >= 0                                    │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF any fail:                                                  │ │   ║
║  │  │   validation_status = 'INVALID'                               │ │   ║
║  │  │   target_listing_status = 'BROKEN'                            │ │   ║
║  │  │   Add to errors array                                         │ │   ║
║  │  │   CONTINUE to next row                                        │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 2: PRODUCT MATCHING                                      │ │   ║
║  │  │                                                               │ │   ║
║  │  │ normalized_name = normalize(product_name)                     │ │   ║
║  │  │                                                               │ │   ║
║  │  │ Search: SELECT * FROM products                                │ │   ║
║  │  │         WHERE normalized_name = :normalized_name              │ │   ║
║  │  │         OR name ILIKE '%' || :product_name || '%'             │ │   ║
║  │  │         AND status = 'APPROVED'                               │ │   ║
║  │  │         LIMIT 1                                               │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF found:                                                     │ │   ║
║  │  │   matched_product_id = product.id                             │ │   ║
║  │  │   will_create_product = false                                 │ │   ║
║  │  │ ELSE:                                                         │ │   ║
║  │  │   matched_product_id = null                                   │ │   ║
║  │  │   will_create_product = true                                  │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 3: PARSE VARIANT VALUES                                  │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF template_type == 'ELECTRONICS':                            │ │   ║
║  │  │   variant_values = {}                                         │ │   ║
║  │  │   FOR each column starting with "Spec:":                      │ │   ║
║  │  │     key = column.replace("Spec:", "").trim().toLowerCase()    │ │   ║
║  │  │     variant_values[key] = row[column]                         │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF template_type == 'GENERAL':                                │ │   ║
║  │  │   variant_values = {}                                         │ │   ║
║  │  │   FOR i = 1 to 10:                                            │ │   ║
║  │  │     IF row["Label_" + i] exists:                              │ │   ║
║  │  │       key = row["Label_" + i].toLowerCase()                   │ │   ║
║  │  │       variant_values[key] = row["Value_" + i]                 │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 4: TECH SPEC VALIDATION                                  │ │   ║
║  │  │                                                               │ │   ║
║  │  │ category = findCategory(row.category_name)                    │ │   ║
║  │  │ rules = SELECT * FROM tech_spec_rules                         │ │   ║
║  │  │         WHERE category_id = category.id                       │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF rules exist AND rules.is_active:                           │ │   ║
║  │  │   missing = []                                                │ │   ║
║  │  │   FOR each spec in rules.required_specs:                      │ │   ║
║  │  │     IF variant_values[spec] is empty:                         │ │   ║
║  │  │       missing.push(spec)                                      │ │   ║
║  │  │                                                               │ │   ║
║  │  │   IF missing.length > 0:                                      │ │   ║
║  │  │     missing_specs = missing                                   │ │   ║
║  │  │     target_listing_status = 'NEEDS_SPECS'                     │ │   ║
║  │  │   ELSE:                                                       │ │   ║
║  │  │     target_listing_status = 'NEEDS_IMAGES'                    │ │   ║
║  │  │ ELSE:                                                         │ │   ║
║  │  │   target_listing_status = 'NEEDS_IMAGES'                      │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 5: DUPLICATE CHECK                                       │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF sku is not empty:                                          │ │   ║
║  │  │   existing = SELECT * FROM shop_products                      │ │   ║
║  │  │              WHERE shop_id = :shopId AND sku = :sku           │ │   ║
║  │  │   IF existing:                                                │ │   ║
║  │  │     validation_status = 'INVALID'                             │ │   ║
║  │  │     errors.push("Duplicate SKU")                              │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF matched_product_id is not null:                            │ │   ║
║  │  │   existing = SELECT * FROM shop_products                      │ │   ║
║  │  │              WHERE shop_id = :shopId                          │ │   ║
║  │  │              AND product_id = :matched_product_id             │ │   ║
║  │  │   IF existing:                                                │ │   ║
║  │  │     validation_status = 'INVALID'                             │ │   ║
║  │  │     errors.push("Product already in shop")                    │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 6: CALCULATE DISPLAY PRICE                               │ │   ║
║  │  │                                                               │ │   ║
║  │  │ display_price = ROUND(base_price * 1.0526, 2)                 │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  │                              │                                     │   ║
║  │                              ▼                                     │   ║
║  │  ┌───────────────────────────────────────────────────────────────┐ │   ║
║  │  │ STEP 7: FINALIZE VALIDATION STATUS                            │ │   ║
║  │  │                                                               │ │   ║
║  │  │ IF errors.length > 0:                                         │ │   ║
║  │  │   validation_status = 'INVALID'                               │ │   ║
║  │  │ ELSE:                                                         │ │   ║
║  │  │   validation_status = 'VALID'                                 │ │   ║
║  │  │                                                               │ │   ║
║  │  │ UPDATE bulk_upload_staging                                    │ │   ║
║  │  │ SET all computed fields                                       │ │   ║
║  │  │ WHERE id = staging_row.id                                     │ │   ║
║  │  └───────────────────────────────────────────────────────────────┘ │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                             ║
║  Response:                                                                  ║
║  {                                                                          ║
║    "batch_id": "...",                                                       ║
║    "summary": {                                                             ║
║      "total": 50,                                                           ║
║      "valid": 42,                                                           ║
║      "invalid": 5,                                                          ║
║      "will_need_specs": 8,                                                  ║
║      "will_need_images": 34,                                                ║
║      "new_products": 3                                                      ║
║    }                                                                        ║
║  }                                                                          ║
╚═════════════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 3: PREVIEW & CORRECTION                                               ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  PREVIEW:                                                                   ║
║  [Seller] ──GET /api/shops/:shopId/bulk/:batchId/preview──>                 ║
║                                                                             ║
║  Response:                                                                  ║
║  {                                                                          ║
║    "valid_rows": [                                                          ║
║      {                                                                      ║
║        "row_number": 2,                                                     ║
║        "product_name": "iPhone 15 Pro",                                     ║
║        "base_price": 1500000,                                               ║
║        "display_price": 1578900,                                            ║
║        "target_status": "NEEDS_IMAGES",                                     ║
║        "matched_product": "iPhone 15 Pro Max 256GB",                        ║
║        "variant_values": {"ram": "8GB", "storage": "256GB"}                 ║
║      }                                                                      ║
║    ],                                                                       ║
║    "invalid_rows": [                                                        ║
║      {                                                                      ║
║        "row_number": 5,                                                     ║
║        "product_name": "Some Phone",                                        ║
║        "errors": [                                                          ║
║          {"field": "base_price", "message": "Price must be positive"}       ║
║        ],                                                                   ║
║        "raw_data": {...}                                                    ║
║      }                                                                      ║
║    ]                                                                        ║
║  }                                                                          ║
║                                                                             ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║                                                                             ║
║  CORRECTION CSV:                                                            ║
║  [Seller] ──GET /api/shops/:shopId/bulk/:batchId/correction-csv──>          ║
║                                                                             ║
║  Response: CSV file download                                                ║
║                                                                             ║
║  CSV Contents:                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐  ║
║  │ Row | Product Name | Base Price | ... | Error_Reason                 │  ║
║  ├──────────────────────────────────────────────────────────────────────┤  ║
║  │ 5   | Some Phone   | -100       | ... | Price must be a positive num │  ║
║  │ 12  | Another Item | 50000      | ... | Duplicate SKU "ABC-123"      │  ║
║  └──────────────────────────────────────────────────────────────────────┘  ║
║                                                                             ║
║  Seller can:                                                                ║
║  1. Fix errors in the CSV                                                   ║
║  2. Re-upload just the corrected rows                                       ║
║  3. Or skip invalid rows and commit valid ones only                         ║
╚═════════════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 4: COMMIT                                                             ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  OPTION A: API Commit (Seller)                                              ║
║  [Seller] ──POST /api/shops/:shopId/bulk/:batchId/commit──>                 ║
║                                                                             ║
║  Body (optional):                                                           ║
║  {                                                                          ║
║    "skip_invalid": true,    // Commit valid rows only                       ║
║    "dry_run": false         // Actually commit                              ║
║  }                                                                          ║
║                                                                             ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║                                                                             ║
║  OPTION B: CLI Commit (Admin)                                               ║
║  $ npx ts-node scripts/sankha-process-batch.ts <batch_id>                   ║
║                                                                             ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║                                                                             ║
║  Commit Process:                                                            ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │ FOR each staging row WHERE validation_status = 'VALID':             │   ║
║  │                                                                     │   ║
║  │   1. IF will_create_product = true:                                 │   ║
║  │      CREATE products record (status = 'PENDING')                    │   ║
║  │      matched_product_id = new_product.id                            │   ║
║  │                                                                     │   ║
║  │   2. CREATE shop_products record:                                   │   ║
║  │      {                                                              │   ║
║  │        shop_id: staging.shop_id,                                    │   ║
║  │        product_id: matched_product_id,                              │   ║
║  │        sku: staging.sku,                                            │   ║
║  │        base_price: staging.base_price,                              │   ║
║  │        display_price: staging.display_price,                        │   ║
║  │        stock_quantity: staging.stock_quantity,                      │   ║
║  │        condition: staging.condition,                                │   ║
║  │        variant_values: staging.variant_values,                      │   ║
║  │        listing_status: staging.target_listing_status,               │   ║
║  │        is_available: false,                                         │   ║
║  │        bulk_upload_id: upload.id                                    │   ║
║  │      }                                                              │   ║
║  │                                                                     │   ║
║  │   3. UPDATE staging row: validation_status = 'COMMITTED'            │   ║
║  │                                                                     │   ║
║  │ UPDATE bulk_uploads:                                                │   ║
║  │   status = 'COMPLETED'                                              │   ║
║  │   successful = count of committed                                   │   ║
║  │   failed = count of invalid                                         │   ║
║  │   needs_specs = count where target_status = 'NEEDS_SPECS'           │   ║
║  │   needs_images = count where target_status = 'NEEDS_IMAGES'         │   ║
║  │   completed_at = NOW()                                              │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                             ║
║  Response:                                                                  ║
║  {                                                                          ║
║    "success": true,                                                         ║
║    "message": "Batch committed successfully",                               ║
║    "summary": {                                                             ║
║      "committed": 42,                                                       ║
║      "skipped": 5,                                                          ║
║      "new_products_created": 3,                                             ║
║      "needs_specs": 8,                                                      ║
║      "needs_images": 34                                                     ║
║    },                                                                       ║
║    "next_steps": [                                                          ║
║      { "action": "Add specs", "endpoint": "/api/shops/:id/products/needs-specs" },  ║
║      { "action": "Add images", "endpoint": "/api/shops/:id/products/needs-images" } ║
║    ]                                                                        ║
║  }                                                                          ║
╚═════════════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║ PHASE 5: POST-COMMIT (Cleanup & Notification)                               ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  1. SEND EMAIL TO SELLER                                                    ║
║     Subject: "Bulk Upload Complete - 42 products added"                     ║
║     Body: Summary + links to complete specs/images                          ║
║                                                                             ║
║  2. CLEANUP STAGING (optional, configurable)                                ║
║     DELETE FROM bulk_upload_staging                                         ║
║     WHERE batch_id = :batchId                                               ║
║     AND validation_status IN ('COMMITTED', 'SKIPPED')                       ║
║                                                                             ║
║     (Keep INVALID rows for 7 days for debugging)                            ║
║                                                                             ║
║  3. ARCHIVE (if needed)                                                     ║
║     Move to bulk_upload_archive table for audit trail                       ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

---

## Template System

### Template Auto-Detection Logic

```typescript
/**
 * Detect template type from Excel column headers
 */
function detectTemplateType(headers: string[]): TemplateType {
  const hasSpecColumns = headers.some(h => h.toLowerCase().startsWith('spec:'));
  const hasLabelColumns = headers.some(h => /^label_\d+$/i.test(h));
  
  if (hasSpecColumns) {
    return 'ELECTRONICS';
  }
  
  if (hasLabelColumns) {
    return 'GENERAL';
  }
  
  // Fallback: detect by category
  return 'AUTO';
}

/**
 * For AUTO template, determine based on category
 */
function inferTemplateFromCategory(categoryName: string): TemplateType {
  const techCategories = [
    'smartphones', 'phones', 'mobile phones',
    'laptops', 'notebooks', 'computers',
    'tablets', 'ipads',
    'tvs', 'televisions',
    'cameras', 'dslr',
    'gaming consoles', 'consoles',
    'smartwatches', 'wearables'
  ];
  
  const normalized = categoryName.toLowerCase().trim();
  
  if (techCategories.some(cat => normalized.includes(cat))) {
    return 'ELECTRONICS';
  }
  
  return 'GENERAL';
}
```

### Template A: Electronics

**Column Structure:**

| Column | Required | Description |
|--------|----------|-------------|
| Product Name | ✅ | Product name |
| Category | ❌ | Category name |
| Brand | ❌ | Brand name |
| SKU | ❌ | Merchant SKU |
| Base Price (MWK) | ✅ | Seller's price |
| Stock Quantity | ✅ | Inventory count |
| Condition | ❌ | NEW, REFURBISHED, etc. |
| Description | ❌ | Product description |
| **Spec: RAM** | ❌* | RAM size (e.g., "8GB") |
| **Spec: Storage** | ❌* | Storage (e.g., "256GB") |
| **Spec: Screen Size** | ❌* | Screen size (e.g., "6.7 inches") |
| **Spec: Color** | ❌ | Color variant |
| **Spec: [Any]** | ❌ | Any additional spec |

*Required for LIVE status in tech categories

**Parsing Logic:**

```typescript
function parseElectronicsRow(row: RawRow): ParsedRow {
  const variantValues: Record<string, string> = {};
  
  // Extract all Spec: columns
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().startsWith('spec:')) {
      const specName = key
        .replace(/^spec:\s*/i, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      
      if (value && String(value).trim()) {
        variantValues[specName] = String(value).trim();
      }
    }
  }
  
  return {
    product_name: row['Product Name'],
    category_name: row['Category'],
    brand: row['Brand'],
    sku: row['SKU'],
    base_price: parseFloat(String(row['Base Price (MWK)']).replace(/,/g, '')),
    stock_quantity: parseInt(String(row['Stock Quantity'])),
    condition: row['Condition'] || 'NEW',
    description: row['Description'],
    variant_values: variantValues
  };
}
```

### Template B: General

**Column Structure:**

| Column | Required | Description |
|--------|----------|-------------|
| Product Name | ✅ | Product name |
| Category | ❌ | Category name |
| Brand | ❌ | Brand name |
| SKU | ❌ | Merchant SKU |
| Base Price (MWK) | ✅ | Seller's price |
| Stock Quantity | ✅ | Inventory count |
| Condition | ❌ | NEW, REFURBISHED, etc. |
| Description | ❌ | Product description |
| **Label_1** | ❌ | Attribute name (e.g., "Size") |
| **Value_1** | ❌ | Attribute value (e.g., "XL") |
| **Label_2** | ❌ | Second attribute name |
| **Value_2** | ❌ | Second attribute value |
| ... up to Label_10/Value_10 | | |

**Parsing Logic:**

```typescript
function parseGeneralRow(row: RawRow): ParsedRow {
  const variantValues: Record<string, string> = {};
  
  // Extract all Label_x/Value_x pairs
  for (let i = 1; i <= 10; i++) {
    const label = row[`Label_${i}`];
    const value = row[`Value_${i}`];
    
    if (label && String(label).trim() && value && String(value).trim()) {
      const key = String(label)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      
      variantValues[key] = String(value).trim();
    }
  }
  
  return {
    product_name: row['Product Name'],
    category_name: row['Category'],
    brand: row['Brand'],
    sku: row['SKU'],
    base_price: parseFloat(String(row['Base Price (MWK)']).replace(/,/g, '')),
    stock_quantity: parseInt(String(row['Stock Quantity'])),
    condition: row['Condition'] || 'NEW',
    description: row['Description'],
    variant_values: variantValues
  };
}
```

---

## Validation Engine

### Tech Spec Validation

```typescript
// Types
interface TechSpecRule {
  category_id: string;
  category_name: string;
  required_specs: string[];    // ["ram", "storage", "screen_size"]
  optional_specs: string[];    // ["color", "warranty"]
  spec_labels: Record<string, string>;  // {"ram": "RAM", "storage": "Storage"}
  spec_validations?: Record<string, SpecValidation>;
  is_active: boolean;
}

interface SpecValidation {
  type: 'string' | 'number' | 'boolean';
  pattern?: string;  // Regex pattern
  min?: number;
  max?: number;
  enum?: string[];
}

interface SpecValidationResult {
  is_tech_category: boolean;
  missing_required: string[];
  invalid_specs: Array<{ spec: string; error: string }>;
  target_status: 'NEEDS_SPECS' | 'NEEDS_IMAGES' | 'LIVE';
}

// Implementation
class TechSpecValidator {
  private rules: Map<string, TechSpecRule> = new Map();
  
  constructor(private prisma: PrismaClient) {}
  
  /**
   * Load rules from database
   */
  async loadRules(): Promise<void> {
    const rules = await this.prisma.tech_spec_rules.findMany({
      where: { is_active: true }
    });
    
    for (const rule of rules) {
      this.rules.set(rule.category_id, {
        category_id: rule.category_id,
        category_name: rule.category_name,
        required_specs: rule.required_specs as string[],
        optional_specs: rule.optional_specs as string[],
        spec_labels: rule.spec_labels as Record<string, string>,
        spec_validations: rule.spec_validations as Record<string, SpecValidation>,
        is_active: rule.is_active
      });
    }
  }
  
  /**
   * Validate variant values against category rules
   */
  validateSpecs(
    categoryId: string | null,
    variantValues: Record<string, string> | null
  ): SpecValidationResult {
    // Default result for non-tech categories
    const defaultResult: SpecValidationResult = {
      is_tech_category: false,
      missing_required: [],
      invalid_specs: [],
      target_status: 'NEEDS_IMAGES'
    };
    
    if (!categoryId) {
      return defaultResult;
    }
    
    const rule = this.rules.get(categoryId);
    
    if (!rule || !rule.is_active) {
      return defaultResult;
    }
    
    // This is a tech category
    const result: SpecValidationResult = {
      is_tech_category: true,
      missing_required: [],
      invalid_specs: [],
      target_status: 'NEEDS_IMAGES'
    };
    
    const values = variantValues || {};
    
    // Check required specs
    for (const spec of rule.required_specs) {
      const value = values[spec];
      
      if (!value || String(value).trim() === '') {
        result.missing_required.push(spec);
      } else if (rule.spec_validations?.[spec]) {
        // Validate spec format
        const validation = rule.spec_validations[spec];
        const error = this.validateSpecValue(spec, value, validation);
        
        if (error) {
          result.invalid_specs.push({ spec, error });
        }
      }
    }
    
    // Determine target status
    if (result.missing_required.length > 0 || result.invalid_specs.length > 0) {
      result.target_status = 'NEEDS_SPECS';
    } else {
      result.target_status = 'NEEDS_IMAGES';
    }
    
    return result;
  }
  
  /**
   * Validate individual spec value
   */
  private validateSpecValue(
    specName: string,
    value: string,
    validation: SpecValidation
  ): string | null {
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return `Invalid format for ${specName}`;
      }
    }
    
    if (validation.enum && !validation.enum.includes(value)) {
      return `${specName} must be one of: ${validation.enum.join(', ')}`;
    }
    
    if (validation.type === 'number') {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return `${specName} must be a number`;
      }
      if (validation.min !== undefined && num < validation.min) {
        return `${specName} must be at least ${validation.min}`;
      }
      if (validation.max !== undefined && num > validation.max) {
        return `${specName} must be at most ${validation.max}`;
      }
    }
    
    return null;
  }
  
  /**
   * Get human-readable labels for missing specs
   */
  getMissingSpecLabels(categoryId: string, missingSpecs: string[]): string[] {
    const rule = this.rules.get(categoryId);
    
    if (!rule) {
      return missingSpecs;
    }
    
    return missingSpecs.map(spec => 
      rule.spec_labels[spec] || spec.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    );
  }
}
```

### Required Spec Rules by Category

| Category | Required Specs | Optional Specs |
|----------|---------------|----------------|
| Smartphones | ram, storage, screen_size | color, warranty, weight, battery, camera |
| Laptops | ram, storage, processor, screen_size | color, warranty, weight, graphics, os |
| Tablets | ram, storage, screen_size | color, warranty, weight, battery |
| TVs | screen_size, resolution | smart_tv, refresh_rate, warranty |
| Cameras | megapixels, sensor_type | lens_mount, video_resolution, warranty |
| Gaming Consoles | storage | color, warranty, included_games |
| Smartwatches | display_type | battery_life, water_resistance, warranty |

---

## Status State Machine

### Listing Status Transitions

```
                                 ┌──────────────────────────────────────────┐
                                 │          BULK UPLOAD COMMIT              │
                                 └────────────────────┬─────────────────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    │                                 │                                 │
                    ▼                                 ▼                                 ▼
           ┌────────────────┐               ┌────────────────┐               ┌────────────────┐
           │    BROKEN      │               │  NEEDS_SPECS   │               │  NEEDS_IMAGES  │
           │                │               │                │               │                │
           │ Invalid data   │               │ Missing tech   │               │ Specs complete │
           │ Cannot proceed │               │ specs          │               │ No images yet  │
           └────────┬───────┘               └────────┬───────┘               └────────┬───────┘
                    │                                 │                                 │
                    │                                 │ [Add specs]                     │ [Add images]
                    │                                 ▼                                 ▼
                    │                        ┌────────────────┐               ┌────────────────┐
                    │                        │  NEEDS_IMAGES  │──────────────►│      LIVE      │
                    │                        └────────────────┘  [Add images] │                │
                    │                                                         │ Visible to     │
                    │                                                         │ buyers         │
                    │                                                         └────────┬───────┘
                    │                                                                  │
                    │         ┌────────────────────────────────────────────────────────┤
                    │         │                                                        │
                    │         ▼                                                        ▼
                    │  ┌────────────────┐                                    ┌────────────────┐
                    │  │   INACTIVE     │                                    │  OUT_OF_STOCK  │
                    │  │                │                                    │                │
                    │  │ Seller         │                                    │ Auto when      │
                    │  │ disabled       │                                    │ stock = 0      │
                    │  └────────────────┘                                    └────────────────┘
                    │                                                                  │
                    │                                                                  │ [Restock]
                    │                                                                  ▼
                    │                                                         ┌────────────────┐
                    └────────────────────────────────────────────────────────►│      LIVE      │
                                         [Fix data & re-upload]               └────────────────┘


TRANSITIONS SUMMARY:
────────────────────
BROKEN       → (Fix via new upload) → NEEDS_SPECS | NEEDS_IMAGES
NEEDS_SPECS  → (Add specs)          → NEEDS_IMAGES
NEEDS_IMAGES → (Add images)         → LIVE
LIVE         → (Seller disable)     → INACTIVE
LIVE         → (Stock = 0)          → OUT_OF_STOCK
INACTIVE     → (Seller enable)      → LIVE
OUT_OF_STOCK → (Restock)            → LIVE
```

### Status Determination Logic

```typescript
function determineListingStatus(
  hasImages: boolean,
  specValidation: SpecValidationResult,
  hasErrors: boolean
): ListingStatus {
  // Invalid data = BROKEN
  if (hasErrors) {
    return 'BROKEN';
  }
  
  // Tech category with missing specs = NEEDS_SPECS
  if (specValidation.is_tech_category && specValidation.missing_required.length > 0) {
    return 'NEEDS_SPECS';
  }
  
  // No images = NEEDS_IMAGES
  if (!hasImages) {
    return 'NEEDS_IMAGES';
  }
  
  // All good = LIVE (but is_available may still be false)
  return 'LIVE';
}
```

---

## API Endpoints

### Complete Endpoint Reference

```yaml
# ============================================================================
# BULK UPLOAD v4.0 - API ENDPOINTS
# ============================================================================

# ----------------------------------------------------------------------------
# TEMPLATE
# ----------------------------------------------------------------------------
GET /api/shops/:shopId/products/bulk/template:
  description: Download Excel template
  auth: Required (shop owner)
  query:
    type: electronics | general (optional, default: general)
  response:
    content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    body: Binary Excel file

# ----------------------------------------------------------------------------
# UPLOAD (Phase 1)
# ----------------------------------------------------------------------------
POST /api/shops/:shopId/products/bulk:
  description: Upload Excel file to staging
  auth: Required (shop owner)
  headers:
    Content-Type: multipart/form-data
  body:
    file: Excel file (.xlsx)
  response:
    200:
      success: true
      data:
        batch_id: string
        upload_id: string
        total_rows: number
        template_type: ELECTRONICS | GENERAL | AUTO
        status: STAGING
        next_step: string (URL to validate endpoint)
    400:
      success: false
      error: "Invalid file" | "Row limit exceeded" | etc.
    403:
      success: false
      error: "Bulk upload is disabled for this shop"

# ----------------------------------------------------------------------------
# VALIDATE (Phase 2)
# ----------------------------------------------------------------------------
POST /api/shops/:shopId/bulk/:batchId/validate:
  description: Run validation on staging rows
  auth: Required (shop owner)
  response:
    200:
      success: true
      data:
        batch_id: string
        summary:
          total: number
          valid: number
          invalid: number
          will_need_specs: number
          will_need_images: number
          new_products: number
        validation_complete: boolean

# ----------------------------------------------------------------------------
# PREVIEW (Phase 3)
# ----------------------------------------------------------------------------
GET /api/shops/:shopId/bulk/:batchId/preview:
  description: Preview validation results
  auth: Required (shop owner)
  query:
    page: number (default: 1)
    limit: number (default: 50)
    filter: valid | invalid | all (default: all)
  response:
    200:
      success: true
      data:
        batch_id: string
        summary:
          total: number
          valid: number
          invalid: number
        valid_rows:
          - row_number: number
            product_name: string
            base_price: number
            display_price: number
            target_status: string
            matched_product: string | null
            will_create_product: boolean
            variant_values: object
            missing_specs: string[]
        invalid_rows:
          - row_number: number
            product_name: string
            errors:
              - field: string
                message: string
            raw_data: object
        pagination:
          currentPage: number
          totalPages: number
          hasNext: boolean
          hasPrev: boolean

# ----------------------------------------------------------------------------
# CORRECTION CSV (Phase 3)
# ----------------------------------------------------------------------------
GET /api/shops/:shopId/bulk/:batchId/correction-csv:
  description: Download CSV of invalid rows with error reasons
  auth: Required (shop owner)
  response:
    content-type: text/csv
    headers:
      Content-Disposition: attachment; filename=correction-{batchId}.csv
    body: CSV with original data + Error_Reason column

# ----------------------------------------------------------------------------
# COMMIT (Phase 4)
# ----------------------------------------------------------------------------
POST /api/shops/:shopId/bulk/:batchId/commit:
  description: Commit valid staging rows to production
  auth: Required (shop owner)
  body:
    skip_invalid: boolean (default: true)
    dry_run: boolean (default: false)
  response:
    200:
      success: true
      message: "Batch committed successfully"
      data:
        summary:
          committed: number
          skipped: number
          new_products_created: number
          needs_specs: number
          needs_images: number
        products:
          - id: string
            product_name: string
            sku: string
            listing_status: string
        next_steps:
          - action: string
            endpoint: string

# ----------------------------------------------------------------------------
# CANCEL
# ----------------------------------------------------------------------------
DELETE /api/shops/:shopId/bulk/:batchId:
  description: Cancel a staging batch
  auth: Required (shop owner)
  response:
    200:
      success: true
      message: "Batch cancelled"

# ----------------------------------------------------------------------------
# UPLOAD HISTORY
# ----------------------------------------------------------------------------
GET /api/shops/:shopId/bulk-uploads:
  description: Get bulk upload history
  auth: Required (shop owner)
  query:
    page: number
    limit: number
    status: STAGING | COMPLETED | FAILED | CANCELLED
  response:
    200:
      success: true
      data:
        uploads:
          - id: string
            batch_id: string
            file_name: string
            total_rows: number
            successful: number
            failed: number
            needs_specs: number
            needs_images: number
            status: string
            created_at: datetime
            completed_at: datetime
        pagination: object

# ----------------------------------------------------------------------------
# PRODUCTS NEEDING SPECS
# ----------------------------------------------------------------------------
GET /api/shops/:shopId/products/needs-specs:
  description: List products that need spec completion
  auth: Required (shop owner)
  query:
    page: number
    limit: number
  response:
    200:
      success: true
      data:
        products:
          - id: string
            product_name: string
            sku: string
            variant_values: object
            missing_specs: string[]
            created_at: datetime
        pagination: object

# ----------------------------------------------------------------------------
# UPDATE PRODUCT SPECS
# ----------------------------------------------------------------------------
PATCH /api/shops/:shopId/products/:productId/specs:
  description: Add/update specs for a product
  auth: Required (shop owner)
  body:
    variant_values:
      ram: "8GB"
      storage: "256GB"
      # ... etc
  response:
    200:
      success: true
      data:
        id: string
        listing_status: string (may change from NEEDS_SPECS to NEEDS_IMAGES)
        variant_values: object
```

---

## CLI Commands

### Process Batch Command

```typescript
// scripts/sankha-process-batch.ts

import { PrismaClient } from '@prisma/client';
import { bulkUploadService } from '../src/services/bulkUpload.service';

const prisma = new PrismaClient();

async function main() {
  const batchId = process.argv[2];
  
  if (!batchId) {
    console.error('Usage: npx ts-node scripts/sankha-process-batch.ts <batch_id>');
    process.exit(1);
  }
  
  console.log(`\n🚀 Processing batch: ${batchId}\n`);
  
  // Get batch info
  const batch = await prisma.bulk_uploads.findFirst({
    where: { batch_id: batchId },
    include: { shops: true }
  });
  
  if (!batch) {
    console.error(`❌ Batch not found: ${batchId}`);
    process.exit(1);
  }
  
  console.log(`📦 Shop: ${batch.shops.name}`);
  console.log(`📄 File: ${batch.file_name}`);
  console.log(`📊 Status: ${batch.status}`);
  
  if (batch.status === 'COMPLETED') {
    console.log('\n✅ Batch already committed');
    process.exit(0);
  }
  
  // Get staging stats
  const stats = await prisma.bulk_upload_staging.groupBy({
    by: ['validation_status'],
    where: { batch_id: batchId },
    _count: true
  });
  
  console.log('\n📈 Staging Stats:');
  for (const stat of stats) {
    console.log(`   ${stat.validation_status}: ${stat._count}`);
  }
  
  // Confirm
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('\n🔄 Commit this batch? (y/N): ', async (answer: string) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      process.exit(0);
    }
    
    console.log('\n⏳ Committing...');
    
    try {
      const result = await bulkUploadService.commitBatch(
        batch.shop_id,
        batchId,
        { skipInvalid: true }
      );
      
      console.log('\n✅ Batch committed successfully!');
      console.log(`   Committed: ${result.committed}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log(`   New products: ${result.newProductsCreated}`);
      console.log(`   Needs specs: ${result.needsSpecs}`);
      console.log(`   Needs images: ${result.needsImages}`);
      
    } catch (error) {
      console.error('\n❌ Commit failed:', error);
      process.exit(1);
    }
    
    rl.close();
    process.exit(0);
  });
}

main();
```

### Generate Correction CSV Command

```typescript
// scripts/sankha-generate-correction.ts

import { PrismaClient } from '@prisma/client';
import { createObjectCsvWriter } from 'csv-writer';

const prisma = new PrismaClient();

async function main() {
  const batchId = process.argv[2];
  
  if (!batchId) {
    console.error('Usage: npx ts-node scripts/sankha-generate-correction.ts <batch_id>');
    process.exit(1);
  }
  
  const invalidRows = await prisma.bulk_upload_staging.findMany({
    where: {
      batch_id: batchId,
      validation_status: 'INVALID'
    },
    orderBy: { row_number: 'asc' }
  });
  
  if (invalidRows.length === 0) {
    console.log('✅ No invalid rows found');
    process.exit(0);
  }
  
  // Determine columns from first row's raw_data
  const sampleRaw = invalidRows[0].raw_data as Record<string, any>;
  const columns = Object.keys(sampleRaw);
  
  // Add Error_Reason column
  columns.push('Error_Reason');
  
  // Prepare records
  const records = invalidRows.map(row => {
    const rawData = row.raw_data as Record<string, any>;
    const errors = row.errors as Array<{ field: string; message: string }>;
    
    return {
      ...rawData,
      Error_Reason: errors.map(e => `${e.field}: ${e.message}`).join('; ')
    };
  });
  
  // Write CSV
  const outputPath = `./correction-${batchId}.csv`;
  
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: columns.map(col => ({ id: col, title: col }))
  });
  
  await csvWriter.writeRecords(records);
  
  console.log(`✅ Correction CSV generated: ${outputPath}`);
  console.log(`   Invalid rows: ${invalidRows.length}`);
}

main();
```

---

## Governance & Safety

### Shop Governance Flag

```typescript
// Middleware to check bulk upload permission
async function checkBulkUploadPermission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { shopId } = req.params;
  
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { can_bulk_upload: true, name: true }
  });
  
  if (!shop) {
    return errorResponse(res, 'Shop not found', null, 404);
  }
  
  if (!shop.can_bulk_upload) {
    return errorResponse(
      res,
      'Bulk upload is disabled for this shop. Please contact support.',
      null,
      403
    );
  }
  
  next();
}
```

### Admin Endpoints for Governance

```yaml
# Admin can disable bulk upload for a shop
PATCH /api/admin/shops/:shopId/bulk-upload:
  auth: Required (ADMIN role)
  body:
    can_bulk_upload: boolean
    reason: string (optional, for audit)
  response:
    200:
      success: true
      message: "Bulk upload permission updated"

# Admin can view all pending batches
GET /api/admin/bulk-uploads/pending:
  auth: Required (ADMIN role)
  response:
    200:
      data:
        batches:
          - batch_id: string
            shop_name: string
            total_rows: number
            status: STAGING
            created_at: datetime
```

### Safety Limits

```typescript
const BULK_UPLOAD_LIMITS = {
  MAX_ROWS_PER_UPLOAD: 500,
  MAX_FILE_SIZE_MB: 10,
  MAX_PENDING_BATCHES_PER_SHOP: 3,
  STAGING_RETENTION_DAYS: 7,
  MAX_UPLOADS_PER_DAY: 10
};
```

---

## Sample Payloads

### Electronics Product (Complete Specs)

```json
{
  "template_type": "ELECTRONICS",
  "raw_row": {
    "Product Name": "iPhone 15 Pro Max 256GB",
    "Category": "Smartphones",
    "Brand": "Apple",
    "SKU": "IP15PM-256-BLK",
    "Base Price (MWK)": 1500000,
    "Stock Quantity": 10,
    "Condition": "NEW",
    "Description": "Brand new, sealed in box. 1 year warranty.",
    "Spec: RAM": "8GB",
    "Spec: Storage": "256GB",
    "Spec: Screen Size": "6.7 inches",
    "Spec: Color": "Black Titanium"
  },
  "parsed": {
    "product_name": "iPhone 15 Pro Max 256GB",
    "normalized_name": "iphone 15 pro max 256gb",
    "category_name": "Smartphones",
    "brand": "Apple",
    "sku": "IP15PM-256-BLK",
    "base_price": 1500000,
    "display_price": 1578900,
    "stock_quantity": 10,
    "condition": "NEW",
    "description": "Brand new, sealed in box. 1 year warranty.",
    "variant_values": {
      "ram": "8GB",
      "storage": "256GB",
      "screen_size": "6.7 inches",
      "color": "Black Titanium"
    }
  },
  "validation": {
    "validation_status": "VALID",
    "matched_product_id": "550e8400-e29b-41d4-a716-446655440000",
    "will_create_product": false,
    "is_tech_category": true,
    "missing_specs": [],
    "errors": [],
    "target_listing_status": "NEEDS_IMAGES"
  }
}
```

### Electronics Product (Missing Specs)

```json
{
  "template_type": "ELECTRONICS",
  "raw_row": {
    "Product Name": "Samsung Galaxy S24 Ultra",
    "Category": "Smartphones",
    "Brand": "Samsung",
    "Base Price (MWK)": 1200000,
    "Stock Quantity": 5,
    "Spec: Color": "Titanium Gray"
  },
  "parsed": {
    "product_name": "Samsung Galaxy S24 Ultra",
    "base_price": 1200000,
    "display_price": 1263120,
    "stock_quantity": 5,
    "variant_values": {
      "color": "Titanium Gray"
    }
  },
  "validation": {
    "validation_status": "VALID",
    "matched_product_id": null,
    "will_create_product": true,
    "is_tech_category": true,
    "missing_specs": ["ram", "storage", "screen_size"],
    "errors": [],
    "target_listing_status": "NEEDS_SPECS"
  }
}
```

### General Product

```json
{
  "template_type": "GENERAL",
  "raw_row": {
    "Product Name": "Nike Air Max 90",
    "Category": "Footwear",
    "Brand": "Nike",
    "Base Price (MWK)": 85000,
    "Stock Quantity": 20,
    "Condition": "NEW",
    "Label_1": "Size",
    "Value_1": "42",
    "Label_2": "Color",
    "Value_2": "White/Black",
    "Label_3": "Material",
    "Value_3": "Leather"
  },
  "parsed": {
    "product_name": "Nike Air Max 90",
    "base_price": 85000,
    "display_price": 89471,
    "stock_quantity": 20,
    "variant_values": {
      "size": "42",
      "color": "White/Black",
      "material": "Leather"
    }
  },
  "validation": {
    "validation_status": "VALID",
    "is_tech_category": false,
    "missing_specs": [],
    "errors": [],
    "target_listing_status": "NEEDS_IMAGES"
  }
}
```

### Invalid/Broken Product

```json
{
  "raw_row": {
    "Product Name": "Some Phone",
    "Category": "Smartphones",
    "Base Price (MWK)": "not a number",
    "Stock Quantity": -5
  },
  "parsed": {
    "product_name": "Some Phone",
    "base_price": null,
    "stock_quantity": -5
  },
  "validation": {
    "validation_status": "INVALID",
    "errors": [
      {
        "field": "base_price",
        "message": "Price must be a positive number"
      },
      {
        "field": "stock_quantity",
        "message": "Stock quantity cannot be negative"
      }
    ],
    "target_listing_status": "BROKEN"
  },
  "correction_csv": {
    "Product Name": "Some Phone",
    "Category": "Smartphones",
    "Base Price (MWK)": "not a number",
    "Stock Quantity": -5,
    "Error_Reason": "base_price: Price must be a positive number; stock_quantity: Stock quantity cannot be negative"
  }
}
```

---

## Implementation Plan

### Phase 1: Database Schema (Week 1)

| Task | Priority | Effort |
|------|----------|--------|
| Create migration for new columns | High | 2h |
| Create bulk_upload_staging table | High | 1h |
| Create tech_spec_rules table | High | 1h |
| Seed tech spec rules | Medium | 2h |
| Update Prisma schema | High | 1h |
| Test migrations | High | 2h |

### Phase 2: Core Services (Week 2)

| Task | Priority | Effort |
|------|----------|--------|
| Implement template detection | High | 3h |
| Implement staging insert | High | 4h |
| Implement validation pipeline | High | 8h |
| Implement tech spec validator | High | 4h |
| Implement product matching | High | 4h |
| Implement commit logic | High | 6h |

### Phase 3: API Endpoints (Week 3)

| Task | Priority | Effort |
|------|----------|--------|
| Upload endpoint (staging) | High | 4h |
| Validate endpoint | High | 2h |
| Preview endpoint | High | 4h |
| Correction CSV endpoint | Medium | 3h |
| Commit endpoint | High | 4h |
| Upload history endpoint | Medium | 2h |
| Products needs-specs endpoint | Medium | 2h |

### Phase 4: CLI & Admin (Week 4)

| Task | Priority | Effort |
|------|----------|--------|
| Process batch CLI command | Medium | 3h |
| Generate correction CLI | Medium | 2h |
| Admin governance endpoints | Medium | 3h |
| Governance middleware | High | 2h |

### Phase 5: Testing & Documentation (Week 5)

| Task | Priority | Effort |
|------|----------|--------|
| Unit tests for validators | High | 6h |
| Integration tests | High | 8h |
| API documentation | Medium | 4h |
| Update existing docs | Medium | 2h |

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration breaks existing data | Low | High | Test on staging first, create backups |
| Performance with large batches | Medium | Medium | Add pagination, async processing |
| Staging table grows too large | Low | Low | Implement cleanup job |
| Complex validation logic bugs | Medium | Medium | Comprehensive unit tests |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sellers confused by new flow | Medium | Medium | Clear documentation, email guides |
| NEEDS_SPECS products never completed | Medium | Low | Reminder emails, dashboard warnings |
| Admin overhead for governance | Low | Low | Clear criteria for disabling |

### Rollback Plan

1. **Database**: Keep old columns, don't delete
2. **API**: Version endpoints (v3 vs v4)
3. **Feature Flag**: `BULK_UPLOAD_V4_ENABLED` env variable
4. **Gradual Rollout**: Enable per-shop first

---

## Appendix: File Structure

```
src/
├── controllers/
│   └── bulkUpload.controller.ts      # Updated for v4
│
├── services/
│   ├── bulkUpload.service.ts         # Updated for v4
│   ├── bulkUploadStaging.service.ts  # NEW: Staging operations
│   ├── bulkUploadValidation.service.ts # NEW: Validation pipeline
│   └── techSpecValidator.service.ts  # NEW: Tech spec validation
│
├── middleware/
│   └── bulkUploadGovernance.middleware.ts # NEW: Permission check
│
├── types/
│   └── bulkUpload.types.ts           # NEW: TypeScript interfaces
│
└── utils/
    └── templateParser.ts             # NEW: Template detection & parsing

scripts/
├── sankha-process-batch.ts           # NEW: CLI command
└── sankha-generate-correction.ts     # NEW: CLI command

prisma/
├── schema.prisma                     # Updated
└── migrations/
    └── YYYYMMDD_bulk_upload_v4/      # NEW: Migration files
```

---

*Document Version: 1.0*  
*Created: February 2026*  
*Author: Lead Backend Architect*
