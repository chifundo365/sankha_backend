# Bulk Upload System v4.0 - Complete Implementation Guide

> **Document Purpose**: This document provides a comprehensive explanation of the Shop-Tech bulk upload system for both AI models and human developers. It covers architecture, data flow, API contracts, database schema, and implementation details.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Core Services](#4-core-services)
5. [API Endpoints](#5-api-endpoints)
6. [Data Flow](#6-data-flow)
7. [Validation Rules](#7-validation-rules)
8. [File Formats](#8-file-formats)
9. [Error Handling](#9-error-handling)
10. [Governance & Permissions](#10-governance--permissions)

---

## 1. System Overview

### What It Does

The Bulk Upload System allows sellers to upload multiple products at once via Excel files instead of creating them one-by-one through the UI. The system supports:

- **New product creation** with automatic parent product matching
- **Inventory updates** for existing products
- **Tech spec validation** for electronics categories
- **Staging pipeline** for review before committing to production
- **Correction file generation** for fixing validation errors

### Key Concepts

| Term | Definition |
|------|------------|
| **Parent Product** | A canonical product in the `products` table (e.g., "iPhone 15 Pro 256GB") |
| **Shop Product** | A seller's listing in `shop_products` that references a parent product with their price/stock |
| **Batch** | A single upload session identified by a unique `batch_id` |
| **Staging Row** | A temporary record in `bulk_upload_staging` awaiting validation and commit |
| **Template Type** | Either `SIMPLE` (basic fields) or `FULL` (includes tech specs) |

### System Versions

- **v1-v3**: Direct insert (no staging, immediate production writes)
- **v4.0**: Staging pipeline with preview, validation, and commit/cancel workflow

---

## 2. Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BULK UPLOAD FLOW v4.0                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  Upload  │───▶│  Parse   │───▶│  Stage   │───▶│  Validate Batch  │  │
│  │  Excel   │    │  XLSX    │    │  Rows    │    │  (Tech Specs)    │  │
│  └──────────┘    └──────────┘    └──────────┘    └────────┬─────────┘  │
│                                                           │             │
│                                                           ▼             │
│                                              ┌────────────────────────┐ │
│                                              │   Preview Results      │ │
│                                              │   - Valid count        │ │
│                                              │   - Invalid count      │ │
│                                              │   - Skipped count      │ │
│                                              └───────────┬────────────┘ │
│                                                          │              │
│                              ┌────────────────┬──────────┴───────┐     │
│                              ▼                ▼                  ▼     │
│                      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│                      │   Commit    │  │   Cancel    │  │  Download   │ │
│                      │   Batch     │  │   Batch     │  │ Corrections │ │
│                      └──────┬──────┘  └─────────────┘  └─────────────┘ │
│                             │                                          │
│                             ▼                                          │
│                    ┌─────────────────┐                                 │
│                    │  Production DB  │                                 │
│                    │  (shop_products)│                                 │
│                    └─────────────────┘                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Service Architecture

```
src/
├── controllers/
│   └── bulkUpload.controller.ts    # HTTP request handlers
├── services/
│   ├── bulkUpload.service.ts       # Legacy v3 service (direct insert)
│   ├── bulkUploadStaging.service.ts # v4 staging pipeline
│   └── bulkUploadCorrection.service.ts # Correction file generation
├── routes/
│   └── shop-product.routes.ts      # Route definitions
└── middleware/
    └── upload.middleware.ts        # Multer file handling
```

---

## 3. Database Schema

### Core Tables

#### `bulk_uploads` - Upload Session Tracking

```sql
CREATE TABLE bulk_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id),
    filename        VARCHAR(255) NOT NULL,
    total_rows      INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows     INTEGER NOT NULL DEFAULT 0,
    skipped_rows    INTEGER NOT NULL DEFAULT 0,
    status          upload_status NOT NULL DEFAULT 'PENDING',
    error_summary   JSONB,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    
    -- v4.0 additions
    batch_id        VARCHAR(50) UNIQUE,
    template_type   template_type DEFAULT 'SIMPLE',
    staged_at       TIMESTAMP,
    committed_at    TIMESTAMP,
    cancelled_at    TIMESTAMP
);
```

#### `bulk_upload_staging` - Temporary Staging Table

```sql
CREATE TABLE bulk_upload_staging (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            VARCHAR(50) NOT NULL,
    shop_id             UUID NOT NULL REFERENCES shops(id),
    row_number          INTEGER NOT NULL,
    
    -- Raw data from Excel
    raw_data            JSONB NOT NULL,
    
    -- Parsed fields
    product_name        VARCHAR(500),
    category_name       VARCHAR(255),
    brand               VARCHAR(255),
    sku                 VARCHAR(100),
    barcode             VARCHAR(100),
    price               DECIMAL(10,2),
    cost_price          DECIMAL(10,2),
    stock_quantity      INTEGER,
    description         TEXT,
    variant_type        VARCHAR(100),
    variant_value       VARCHAR(255),
    image_urls          TEXT[],
    tech_specs          JSONB,
    
    -- Validation results
    validation_status   staging_validation_status DEFAULT 'PENDING',
    errors              JSONB DEFAULT '[]',
    warnings            JSONB DEFAULT '[]',
    
    -- Matching results
    matched_product_id  UUID REFERENCES products(id),
    matched_shop_product_id UUID REFERENCES shop_products(id),
    is_update           BOOLEAN DEFAULT FALSE,
    
    created_at          TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(batch_id, row_number)
);
```

#### `tech_spec_rules` - Category-Specific Validation Rules

```sql
CREATE TABLE tech_spec_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID REFERENCES categories(id),
    category_name   VARCHAR(255) NOT NULL,
    spec_key        VARCHAR(100) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    is_required     BOOLEAN DEFAULT FALSE,
    validation_type VARCHAR(50) DEFAULT 'text',
    allowed_values  TEXT[],
    unit            VARCHAR(50),
    created_at      TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(category_name, spec_key)
);
```

### Enums

```sql
-- Upload status progression
CREATE TYPE upload_status AS ENUM (
    'PENDING',      -- Initial state
    'PROCESSING',   -- Being parsed
    'STAGING',      -- v4: In staging table
    'COMPLETED',    -- Successfully committed
    'FAILED',       -- Processing failed
    'CANCELLED'     -- v4: User cancelled
);

-- Template complexity
CREATE TYPE template_type AS ENUM (
    'SIMPLE',       -- Basic fields only
    'FULL'          -- Includes tech specs columns
);

-- Per-row validation status
CREATE TYPE staging_validation_status AS ENUM (
    'PENDING',      -- Not yet validated
    'VALID',        -- Ready to commit
    'INVALID',      -- Has errors, needs correction
    'SKIPPED'       -- Duplicate, will be skipped
);

-- Product listing status (updated)
CREATE TYPE listing_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'INACTIVE',
    'OUT_OF_STOCK',
    'NEEDS_SPECS',  -- v4: Missing required tech specs
    'BROKEN'        -- v4: Data integrity issue
);
```

---

## 4. Core Services

### 4.1 BulkUploadStagingService

**Location**: `src/services/bulkUploadStaging.service.ts`

**Purpose**: Handles the v4.0 staging pipeline - parsing, staging, validation, preview, and commit/cancel operations.

#### Key Methods

| Method | Purpose | Parameters | Returns |
|--------|---------|------------|---------|
| `generateBatchId()` | Creates unique batch identifier | - | `string` (format: `BULK-{timestamp}-{random}`) |
| `canShopBulkUpload(shopId)` | Checks if shop has bulk upload permission | `shopId: string` | `{ allowed: boolean, reason?: string }` |
| `insertStagingRows(...)` | Parses Excel and inserts into staging | `shopId, file, batchId` | `{ batchId, totalRows, uploadId }` |
| `validateStagingBatch(batchId)` | Runs validation on all staging rows | `batchId: string` | `{ valid, invalid, skipped, errors }` |
| `getPreview(batchId)` | Returns preview of staging results | `batchId: string` | `StagingPreview` object |
| `commitBatch(batchId)` | Moves valid rows to production | `batchId: string` | `CommitResult` object |
| `cancelBatch(batchId)` | Deletes staging rows, marks cancelled | `batchId: string` | `{ success: boolean }` |
| `detectTemplateType(headers)` | Determines SIMPLE vs FULL template | `headers: string[]` | `'SIMPLE' \| 'FULL'` |

#### Internal Methods

| Method | Purpose |
|--------|---------|
| `parseExcelRow(row, headers, rowNum)` | Converts Excel row to staging record |
| `matchParentProduct(row)` | Fuzzy matches to existing product catalog |
| `checkDuplicate(shopId, row)` | Detects if product already exists in shop |
| `validateTechSpecs(specs, categoryName)` | Validates against tech_spec_rules |
| `createParentProduct(row, shopId)` | Creates new product if no match found |
| `createShopProduct(row, productId, shopId)` | Creates shop_product record |
| `updateShopProduct(row, shopProductId)` | Updates existing shop_product |

### 4.2 BulkUploadCorrectionService

**Location**: `src/services/bulkUploadCorrection.service.ts`

**Purpose**: Generates correction Excel files for invalid rows and manages tech spec updates.

#### Key Methods

| Method | Purpose | Parameters | Returns |
|--------|---------|------------|---------|
| `generateCorrectionFile(batchId)` | Creates Excel with invalid rows + error annotations | `batchId: string` | `Buffer` (XLSX file) |
| `markCorrectionDownloaded(batchId)` | Records that correction was downloaded | `batchId: string` | `void` |
| `getCorrectionPreview(batchId, limit)` | Returns preview without file generation | `batchId, limit` | `CorrectionPreview` |
| `getProductsNeedingSpecs(shopId, page, limit)` | Lists products with NEEDS_SPECS status | `shopId, page, limit` | Paginated product list |
| `updateProductSpecs(shopProductId, specs)` | Updates tech specs on a product | `shopProductId, specs` | Updated product |

### 4.3 BulkUploadService (Legacy v3)

**Location**: `src/services/bulkUpload.service.ts`

**Purpose**: Original direct-insert service, still available for backwards compatibility.

#### Key Methods

| Method | Purpose |
|--------|---------|
| `processUpload(shopId, file)` | Direct processing without staging |
| `generateTemplate(categoryId)` | Creates downloadable Excel template |
| `getUploadHistory(shopId)` | Returns past upload records |

---

## 5. API Endpoints

### Base Path: `/api/shop-products`

### Upload & Staging Endpoints

#### `POST /bulk/upload`
Upload Excel file and stage for processing.

**Request**:
- Content-Type: `multipart/form-data`
- Body: `file` (Excel file)
- Auth: Bearer token (must be seller/admin)

**Response** (201):
```json
{
  "success": true,
  "data": {
    "batchId": "BULK-1706886400000-abc123",
    "uploadId": "uuid-here",
    "totalRows": 150,
    "status": "STAGING",
    "previewUrl": "/api/shop-products/bulk/BULK-1706886400000-abc123/preview"
  }
}
```

#### `GET /bulk/:batchId/preview`
Get staging preview with validation results.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "batchId": "BULK-1706886400000-abc123",
    "status": "STAGING",
    "templateType": "FULL",
    "summary": {
      "total": 150,
      "valid": 120,
      "invalid": 25,
      "skipped": 5
    },
    "validSample": [
      {
        "rowNumber": 1,
        "productName": "iPhone 15 Pro",
        "price": 1999.99,
        "stock": 10,
        "isUpdate": false,
        "matchedProduct": "iPhone 15 Pro 256GB"
      }
    ],
    "invalidSample": [
      {
        "rowNumber": 45,
        "productName": "Samsung TV",
        "errors": [
          { "field": "screen_size", "message": "Required tech spec missing", "type": "MISSING_SPEC" }
        ]
      }
    ],
    "canCommit": true,
    "warnings": []
  }
}
```

#### `POST /bulk/:batchId/commit`
Commit valid rows to production.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "committed": 120,
    "created": 100,
    "updated": 20,
    "skipped": 5,
    "failed": 25,
    "status": "COMPLETED"
  }
}
```

#### `DELETE /bulk/:batchId/cancel`
Cancel batch and delete staging rows.

**Response** (200):
```json
{
  "success": true,
  "message": "Batch cancelled successfully"
}
```

### Correction Endpoints

#### `GET /bulk/:batchId/corrections`
Download correction Excel file.

**Response**: Excel file download (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

#### `GET /bulk/:batchId/corrections/preview`
Preview corrections without downloading.

**Query Params**: `limit` (default: 20)

**Response** (200):
```json
{
  "success": true,
  "data": {
    "total": 25,
    "preview": [
      {
        "rowNumber": 45,
        "productName": "Samsung TV",
        "errors": [
          { "field": "screen_size", "message": "Required tech spec missing" }
        ],
        "status": "INVALID"
      }
    ],
    "errorSummary": {
      "screen_size": 10,
      "ram": 8,
      "price": 7
    }
  }
}
```

### Tech Spec Management

#### `GET /needs-specs`
Get products needing tech specs.

**Query Params**: `page`, `limit`

**Response** (200):
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Samsung Galaxy S24",
        "category": "Smartphones",
        "currentSpecs": { "brand": "Samsung" },
        "missingSpecs": ["ram", "storage", "screen_size"],
        "requiredSpecs": [
          { "key": "ram", "displayName": "RAM", "unit": "GB" },
          { "key": "storage", "displayName": "Storage", "unit": "GB" }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

#### `PATCH /:shopProductId/specs`
Update product tech specs.

**Request Body**:
```json
{
  "specs": {
    "ram": "8",
    "storage": "256",
    "screen_size": "6.2"
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Samsung Galaxy S24",
    "techSpecs": { "ram": "8", "storage": "256", "screen_size": "6.2" },
    "listingStatus": "ACTIVE"
  }
}
```

### Template & History

#### `GET /bulk/template`
Download Excel template.

**Query Params**: `categoryId` (optional), `type` (simple|full)

#### `GET /bulk/history`
Get upload history for shop.

**Query Params**: `page`, `limit`, `status`

---

## 6. Data Flow

### Complete Upload Flow

```
1. UPLOAD PHASE
   ├── User uploads Excel file
   ├── Multer middleware saves to temp storage
   ├── Controller extracts shopId from auth token
   └── Calls stagingService.insertStagingRows()

2. STAGING PHASE
   ├── Generate unique batchId
   ├── Create bulk_uploads record (status: STAGING)
   ├── Parse Excel with XLSX library
   ├── Detect template type (SIMPLE/FULL)
   ├── For each row:
   │   ├── Parse raw data into typed fields
   │   ├── Insert into bulk_upload_staging
   │   └── Set validation_status = PENDING
   └── Return batchId to client

3. VALIDATION PHASE (automatic after staging)
   ├── Fetch all PENDING rows for batch
   ├── For each row:
   │   ├── Validate required fields (name, price, stock)
   │   ├── Match to parent product (fuzzy search)
   │   ├── Check for duplicates in shop
   │   ├── Validate tech specs against rules
   │   ├── Update validation_status (VALID/INVALID/SKIPPED)
   │   └── Store errors[] and warnings[]
   └── Update bulk_uploads with counts

4. PREVIEW PHASE
   ├── Client requests GET /bulk/:batchId/preview
   ├── Aggregate counts by validation_status
   ├── Sample valid and invalid rows
   └── Return preview with canCommit flag

5. DECISION PHASE
   ├── Option A: COMMIT
   │   ├── Fetch all VALID rows
   │   ├── For each row:
   │   │   ├── Create/update parent product
   │   │   └── Create/update shop_product
   │   ├── Delete staging rows
   │   ├── Update bulk_uploads (status: COMPLETED)
   │   └── Return commit summary
   │
   ├── Option B: CANCEL
   │   ├── Delete all staging rows for batch
   │   ├── Update bulk_uploads (status: CANCELLED)
   │   └── Return confirmation
   │
   └── Option C: DOWNLOAD CORRECTIONS
       ├── Fetch INVALID and SKIPPED rows
       ├── Generate Excel with error annotations
       ├── User fixes errors locally
       └── User re-uploads corrected file (new batch)
```

### Parent-Child Product Matching

```
Input: Row with product_name, category, brand, variant_type, variant_value

1. Exact Match
   └── Search products WHERE LOWER(name) = LOWER(input_name)

2. Fuzzy Match (if no exact)
   └── Search products WHERE name ILIKE '%{keyword}%'
       AND (category matches OR brand matches)

3. Variant Matching
   └── If variant_type provided (e.g., "Color", "Size"):
       ├── Look for parent with same base name
       └── Create shop_product with variant_values JSON

4. No Match Found
   └── Create new parent product
       ├── name = input_name
       ├── category_id = resolved category
       ├── brand_id = resolved brand
       └── Return new product ID

5. Create Shop Product
   └── INSERT shop_products (
           shop_id, product_id, seller_price,
           stock_quantity, variant_values, listing_status
       )
```

---

## 7. Validation Rules

### Required Field Validation

| Field | Rule | Error Type |
|-------|------|------------|
| `product_name` | Non-empty string | `MISSING_REQUIRED` |
| `price` | Positive number | `INVALID_PRICE` |
| `stock_quantity` | Non-negative integer | `INVALID_STOCK` |
| `category` | Must exist in categories table | `INVALID_CATEGORY` |

### Tech Spec Validation

Tech specs are validated against `tech_spec_rules` based on category:

```typescript
interface TechSpecRule {
  spec_key: string;        // e.g., "ram", "screen_size"
  display_name: string;    // e.g., "RAM", "Screen Size"
  is_required: boolean;    // Whether spec is mandatory
  validation_type: string; // "text", "number", "enum"
  allowed_values?: string[]; // For enum type
  unit?: string;           // e.g., "GB", "inches"
}
```

**Default Rules (seeded)**:

| Category | Spec Key | Display Name | Required | Type |
|----------|----------|--------------|----------|------|
| Smartphones | ram | RAM | Yes | number |
| Smartphones | storage | Storage | Yes | number |
| Smartphones | screen_size | Screen Size | Yes | number |
| Smartphones | battery | Battery | No | number |
| Laptops | ram | RAM | Yes | number |
| Laptops | storage | Storage | Yes | number |
| Laptops | processor | Processor | Yes | text |
| TVs | screen_size | Screen Size | Yes | number |
| TVs | resolution | Resolution | Yes | enum |

### Duplicate Detection

A row is marked as `SKIPPED` if:

```sql
SELECT EXISTS (
  SELECT 1 FROM shop_products sp
  JOIN products p ON sp.product_id = p.id
  WHERE sp.shop_id = :shopId
  AND (
    (sp.sku = :inputSku AND :inputSku IS NOT NULL)
    OR (LOWER(p.name) = LOWER(:inputName) AND sp.variant_values = :inputVariants)
  )
)
```

---

## 8. File Formats

### Upload Template (SIMPLE)

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Product Name | String | Yes | Name of the product |
| Category | String | Yes | Category name (must exist) |
| Brand | String | No | Brand name |
| SKU | String | No | Seller's SKU code |
| Barcode | String | No | UPC/EAN barcode |
| Price | Number | Yes | Selling price |
| Cost Price | Number | No | Cost/wholesale price |
| Stock Quantity | Integer | Yes | Available stock |
| Description | String | No | Product description |
| Variant Type | String | No | e.g., "Color", "Size" |
| Variant Value | String | No | e.g., "Red", "Large" |
| Image URLs | String | No | Comma-separated URLs |

### Upload Template (FULL)

Includes all SIMPLE columns plus:

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| RAM | String | Category-dependent | RAM specification |
| Storage | String | Category-dependent | Storage specification |
| Screen Size | String | Category-dependent | Screen size |
| Processor | String | Category-dependent | Processor type |
| Battery | String | No | Battery capacity |
| Resolution | String | Category-dependent | Display resolution |

### Correction File Format

Generated Excel includes:

1. **Sheet 1: "Errors"**
   - All original columns
   - `Error_Summary` column with concatenated errors
   - Red highlighting on cells with errors

2. **Sheet 2: "Error Details"**
   - `Row Number`
   - `Field`
   - `Error Type`
   - `Message`
   - `Current Value`
   - `Expected Format`

---

## 9. Error Handling

### Error Types

```typescript
type ErrorType =
  | 'MISSING_REQUIRED'    // Required field is empty
  | 'INVALID_FORMAT'      // Wrong data format
  | 'INVALID_PRICE'       // Price <= 0 or non-numeric
  | 'INVALID_STOCK'       // Stock < 0 or non-integer
  | 'INVALID_CATEGORY'    // Category not found
  | 'INVALID_BRAND'       // Brand not found
  | 'DUPLICATE'           // Product already exists
  | 'MISSING_SPEC'        // Required tech spec missing
  | 'INVALID_SPEC'        // Tech spec value invalid
  | 'IMAGE_ERROR'         // Image URL invalid
  | 'SYSTEM_ERROR';       // Internal error
```

### Error Structure

```typescript
interface RowError {
  field: string;      // Column/field name
  message: string;    // Human-readable message
  type: ErrorType;    // Error classification
  value?: any;        // Current invalid value
  expected?: string;  // Expected format/value
}
```

### HTTP Error Responses

| Status | Scenario |
|--------|----------|
| 400 | Invalid file format, missing file |
| 401 | Not authenticated |
| 403 | Shop doesn't have bulk upload permission |
| 404 | Batch not found |
| 409 | Batch already committed/cancelled |
| 422 | Validation errors (returns error details) |
| 500 | Internal server error |

---

## 10. Governance & Permissions

### Shop-Level Controls

```typescript
// In shops table
{
  can_bulk_upload: boolean;  // Default: false
  // Must be enabled by admin
}
```

### Permission Check Flow

```typescript
async canShopBulkUpload(shopId: string): Promise<{allowed: boolean, reason?: string}> {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { can_bulk_upload: true, status: true }
  });

  if (!shop) {
    return { allowed: false, reason: 'Shop not found' };
  }

  if (shop.status !== 'ACTIVE') {
    return { allowed: false, reason: 'Shop is not active' };
  }

  if (!shop.can_bulk_upload) {
    return { allowed: false, reason: 'Bulk upload not enabled for this shop' };
  }

  return { allowed: true };
}
```

### Admin Controls

Admins can:
- Enable/disable bulk upload per shop
- View all batch uploads across shops
- Cancel any batch
- Modify tech spec rules

---

## Appendix A: Type Definitions

```typescript
// Staging Preview Response
interface StagingPreview {
  batchId: string;
  status: UploadStatus;
  templateType: TemplateType;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
  };
  validSample: ValidRowPreview[];
  invalidSample: InvalidRowPreview[];
  canCommit: boolean;
  warnings: string[];
}

// Commit Result
interface CommitResult {
  committed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  status: 'COMPLETED' | 'PARTIAL';
  errors?: Array<{rowNumber: number, error: string}>;
}

// Correction Preview
interface CorrectionPreview {
  total: number;
  preview: Array<{
    rowNumber: number;
    productName?: string;
    errors: RowError[];
    status: 'INVALID' | 'DUPLICATE';
  }>;
  errorSummary: Record<string, number>;
}
```

---

## Appendix B: Database Indexes

```sql
-- Performance indexes for bulk operations
CREATE INDEX idx_staging_batch ON bulk_upload_staging(batch_id);
CREATE INDEX idx_staging_status ON bulk_upload_staging(batch_id, validation_status);
CREATE INDEX idx_staging_shop ON bulk_upload_staging(shop_id);
CREATE INDEX idx_uploads_shop ON bulk_uploads(shop_id);
CREATE INDEX idx_uploads_batch ON bulk_uploads(batch_id);
CREATE INDEX idx_shop_products_listing ON shop_products(shop_id, listing_status);
CREATE INDEX idx_tech_rules_category ON tech_spec_rules(category_name);
```

---

## Appendix C: Configuration

### Environment Variables

```env
# File upload limits
MAX_BULK_UPLOAD_SIZE=10485760  # 10MB
MAX_BULK_ROWS=5000             # Maximum rows per upload

# Staging cleanup
STAGING_RETENTION_HOURS=24     # Auto-delete uncommitted staging after 24h

# Validation
ENABLE_TECH_SPEC_VALIDATION=true
STRICT_CATEGORY_MATCHING=false
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2024-01 | Initial implementation |
| v2.0 | 2024-06 | Added variant support |
| v3.0 | 2024-09 | Added tech specs, correction files |
| v4.0 | 2025-02 | Staging pipeline, commit/cancel workflow |

---

*Document generated for Sankha/ formery shop-tech Backend v4.0*
*Last updated: February 2026*
