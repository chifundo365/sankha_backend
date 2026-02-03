# Shop-Tech Bulk Upload System v4.0
## Complete Implementation Reference

> **Purpose**: This document serves as the authoritative reference for the Shop-Tech bulk upload system. It is designed for both AI models (for code generation and understanding) and human developers (for implementation and maintenance).

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Database Schema](#3-database-schema)
4. [Type System](#4-type-system)
5. [Core Services](#5-core-services)
6. [Middleware & Security](#6-middleware--security)
7. [API Reference](#7-api-reference)
8. [Data Flow & Pipelines](#8-data-flow--pipelines)
9. [Validation Engine](#9-validation-engine)
10. [Product Matching System](#10-product-matching-system)
11. [File Formats & Templates](#11-file-formats--templates)
12. [CLI Tools](#12-cli-tools)
13. [Background Jobs](#13-background-jobs)
14. [Error Handling](#14-error-handling)
15. [Configuration](#15-configuration)
16. [Deployment Guide](#16-deployment-guide)

---

# 1. Executive Summary

## What is the Bulk Upload System?

The Bulk Upload System enables Shop-Tech sellers to upload multiple products simultaneously via Excel files instead of creating them individually through the UI. This dramatically improves seller onboarding and inventory management efficiency.

## Version History

| Version | Features |
|---------|----------|
| v1.0-v3.0 | Direct insert to production (no staging) |
| **v4.0** | Staging pipeline, preview, commit/cancel, governance, fuzzy matching |

## Key Features (v4.0)

- **Staging Pipeline**: Upload → Parse → Validate → Preview → Commit/Cancel
- **Tech Spec Validation**: Category-specific required/optional specifications
- **Fuzzy Product Matching**: pg_trgm similarity with verified product priority
- **Governance Controls**: Shop-level permissions, batch ownership, rate limits
- **Correction Files**: Auto-generated Excel files for fixing errors
- **Bilingual Errors**: English + Chichewa error messages
- **Background Cleanup**: Automated stale data removal

## Core Terminology

| Term | Definition |
|------|------------|
| **Parent Product** | Canonical product record in `products` table (e.g., "iPhone 15 Pro 256GB") |
| **Shop Product** | Seller's listing in `shop_products` referencing a parent product with price/stock |
| **Batch** | Single upload session with unique `batch_id` (format: `{shop_prefix}-{timestamp}-{random}`) |
| **Staging Row** | Temporary record in `bulk_upload_staging` awaiting commit |
| **Template Type** | `ELECTRONICS` (tech specs) or `GENERAL` (basic fields) |
| **Listing Status** | Product lifecycle state: `NEEDS_IMAGES`, `NEEDS_SPECS`, `LIVE`, etc. |

---

# 2. System Architecture

## Directory Structure

```
src/
├── controllers/
│   └── bulkUpload.controller.ts     # HTTP request handlers
│
├── services/
│   ├── bulkUpload.service.ts        # Legacy v3 (direct insert)
│   ├── bulkUploadStaging.service.ts # v4 staging pipeline
│   ├── bulkUploadCorrection.service.ts # Correction file generation
│   ├── productMatching.service.ts   # Fuzzy product matching
│   └── techSpecValidator.service.ts # Tech spec validation
│
├── middleware/
│   ├── bulkUploadGovernance.middleware.ts # Permission checks
│   └── upload.middleware.ts         # Multer file handling
│
├── jobs/
│   └── bulkUploadCleanup.job.ts     # Cron-based cleanup
│
├── routes/
│   └── shop-product.routes.ts       # Route definitions
│
├── types/
│   └── bulkUpload.types.ts          # TypeScript type definitions
│
scripts/
├── sankha-process-batch.ts          # CLI: Force commit batch
└── sankha-generate-correction.ts    # CLI: Export corrections
```

## High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BULK UPLOAD FLOW v4.0                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────────────┐ │
│  │   UPLOAD   │──▶│   PARSE    │──▶│   STAGE    │──▶│     VALIDATE       │ │
│  │   Excel    │   │   XLSX     │   │   Rows     │   │   (Tech Specs)     │ │
│  │   File     │   │   Library  │   │   to DB    │   │   (Product Match)  │ │
│  └────────────┘   └────────────┘   └────────────┘   └─────────┬──────────┘ │
│                                                                │            │
│       Middleware:                                              ▼            │
│       • canBulkUpload            ┌─────────────────────────────────────┐   │
│       • checkPendingBatchLimit   │           PREVIEW RESULTS           │   │
│                                  │  • Valid rows: ready to commit      │   │
│                                  │  • Invalid rows: need correction    │   │
│                                  │  • Skipped rows: duplicates         │   │
│                                  └───────────────┬─────────────────────┘   │
│                                                  │                          │
│                    ┌─────────────────────────────┼─────────────────────┐   │
│                    ▼                             ▼                     ▼   │
│           ┌──────────────┐            ┌──────────────┐      ┌───────────┐ │
│           │    COMMIT    │            │    CANCEL    │      │ DOWNLOAD  │ │
│           │    Batch     │            │    Batch     │      │CORRECTIONS│ │
│           └──────┬───────┘            └──────────────┘      └───────────┘ │
│                  │                                                         │
│                  ▼                                                         │
│         ┌─────────────────┐                                                │
│         │  PRODUCTION DB  │                                                │
│         │ (shop_products) │                                                │
│         └─────────────────┘                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL with Prisma ORM |
| Excel Processing | XLSX library |
| Fuzzy Search | pg_trgm extension (with Fuse.js fallback) |
| File Upload | Multer middleware |
| Scheduling | node-cron |
| Language | TypeScript |

---

# 3. Database Schema

## Core Tables

### `bulk_uploads` - Upload Session Tracking

```prisma
model bulk_uploads {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  shop_id         String          @db.Uuid
  file_name       String          @db.VarChar(255)
  total_rows      Int             // Total rows in uploaded file
  successful      Int             @default(0)
  failed          Int             @default(0)
  skipped         Int             @default(0)
  needs_specs     Int             @default(0)       // v4.0
  needs_images    Int             @default(0)       // v4.0
  errors          Json?           // [{row, field, message}]
  status          upload_status   @default(PROCESSING)
  batch_id        String?         @db.VarChar(50)   // v4.0: Unique batch identifier
  template_type   template_type?                    // v4.0: ELECTRONICS or GENERAL
  created_at      DateTime        @default(now())
  completed_at    DateTime?
  
  shops           shops           @relation(...)
  shop_products   shop_products[]
  staging_rows    bulk_upload_staging[]
}
```

### `bulk_upload_staging` - Temporary Staging Table

```prisma
model bulk_upload_staging {
  id                    String                    @id @db.Uuid
  batch_id              String                    @db.VarChar(50)
  bulk_upload_id        String?                   @db.Uuid
  shop_id               String                    @db.Uuid
  row_number            Int
  
  // Raw data (preserved exactly as uploaded)
  raw_data              Json                      @db.JsonB
  
  // Parsed/normalized data
  product_name          String?                   @db.VarChar(255)
  normalized_name       String?                   @db.VarChar(255)
  category_name         String?                   @db.VarChar(100)
  brand                 String?                   @db.VarChar(100)
  sku                   String?                   @db.VarChar(50)
  base_price            Decimal?                  @db.Decimal(12, 2)
  display_price         Decimal?                  @db.Decimal(12, 2)
  stock_quantity        Int?
  condition             String?                   @db.VarChar(20)
  description           String?
  
  // Variant/spec values
  variant_values        Json?                     @db.JsonB
  
  // Template & validation
  template_type         template_type             @default(GENERAL)
  validation_status     staging_validation_status @default(PENDING)
  
  // Product matching
  matched_product_id    String?                   @db.Uuid
  will_create_product   Boolean                   @default(false)
  
  // Spec validation results
  missing_specs         Json?                     @db.JsonB
  errors                Json?                     @db.JsonB
  
  // Target listing status
  target_listing_status listing_status?
  
  created_at            DateTime                  @default(now())
  processed_at          DateTime?
}
```

### `tech_spec_rules` - Category-Specific Validation Rules

```prisma
model tech_spec_rules {
  id                String      @id @db.Uuid
  category_id       String?     @unique @db.Uuid
  category_name     String      @db.VarChar(100)
  required_specs    Json        @default("[]")     // ["ram", "storage", "screen_size"]
  optional_specs    Json        @default("[]")     // ["color", "warranty"]
  spec_labels       Json        @default("{}")     // {"ram": "RAM (GB)", ...}
  spec_validations  Json?                          // Validation rules
  is_active         Boolean     @default(true)
  
  categories        categories? @relation(...)
}
```

### `shops` - Shop Configuration (relevant fields)

```prisma
model shops {
  // ... other fields ...
  can_bulk_upload   Boolean     @default(true)     // v4.0: Permission flag
  // ...
}
```

### `shop_products` - Seller Inventory (relevant fields)

```prisma
model shop_products {
  // ... other fields ...
  variant_values    Json?       @db.JsonB          // v4.0: Structured specs
  listing_status    listing_status? @default(LIVE)
  bulk_upload_id    String?     @db.Uuid           // Links to bulk_uploads
  // ...
}
```

## Enums

```prisma
enum upload_status {
  STAGING       // v4.0: In staging, not committed
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED     // v4.0: User cancelled
}

enum template_type {
  ELECTRONICS   // Has spec columns (RAM, Storage, etc.)
  GENERAL       // Basic fields only
  AUTO          // Auto-detected
}

enum staging_validation_status {
  PENDING       // Not yet validated
  VALID         // Ready to commit
  INVALID       // Has errors
  COMMITTED     // Moved to production
  SKIPPED       // Duplicate
}

enum listing_status {
  NEEDS_IMAGES      // Uploaded, waiting for images
  NEEDS_SPECS       // v4.0: Missing required specs
  PENDING_REVIEW    // Has images, awaiting approval
  LIVE              // Approved and visible
  REJECTED          // Not approved
  PAUSED            // Hidden by seller
  BROKEN            // v4.0: Invalid data
}
```

## Indexes

```sql
-- Staging table indexes
CREATE INDEX idx_staging_batch_id ON bulk_upload_staging(batch_id);
CREATE INDEX idx_staging_shop_batch ON bulk_upload_staging(shop_id, batch_id);
CREATE INDEX idx_staging_validation_status ON bulk_upload_staging(validation_status);

-- Bulk uploads indexes
CREATE INDEX idx_bulk_uploads_shop_id ON bulk_uploads(shop_id);
CREATE INDEX idx_bulk_uploads_status ON bulk_uploads(status);
CREATE INDEX idx_bulk_uploads_batch_id ON bulk_uploads(batch_id);

-- Product matching (requires pg_trgm extension)
CREATE INDEX idx_products_normalized_name_trgm 
  ON products USING GIN (normalized_name gin_trgm_ops);
```

---

# 4. Type System

## Location: `src/types/bulkUpload.types.ts`

## Core Enums

```typescript
export enum TemplateType {
  ELECTRONICS = 'ELECTRONICS',
  GENERAL = 'GENERAL',
  AUTO = 'AUTO'
}

export enum StagingValidationStatus {
  PENDING = 'PENDING',
  VALID = 'VALID',
  INVALID = 'INVALID',
  COMMITTED = 'COMMITTED',
  SKIPPED = 'SKIPPED'
}

export enum ListingStatusV4 {
  LIVE = 'LIVE',
  NEEDS_IMAGES = 'NEEDS_IMAGES',
  NEEDS_SPECS = 'NEEDS_SPECS',
  BROKEN = 'BROKEN',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  PAUSED = 'PAUSED'
}

export enum UploadStatusV4 {
  STAGING = 'STAGING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
```

## Core Interfaces

### Row Error

```typescript
export interface RowError {
  row: number;
  field: string;
  message: string;
  code?: string;
}
```

### Parsed Row

```typescript
export interface ParsedRow {
  rowNumber: number;
  productName: string;
  normalizedName: string;
  categoryName?: string;
  brand?: string;
  sku?: string;
  basePrice: number;
  displayPrice: number;
  stockQuantity: number;
  condition: string;
  description?: string;
  variantValues: Record<string, string>;
  templateType: TemplateType;
}
```

### Staging Summary

```typescript
export interface StagingSummary {
  batchId: string;
  uploadId: string;
  shopId: string;
  fileName: string;
  templateType: TemplateType;
  total: number;
  valid: number;
  invalid: number;
  willNeedSpecs: number;
  willNeedImages: number;
  newProducts: number;
  duplicates: number;
}
```

### Commit Summary

```typescript
export interface CommitSummary {
  batchId: string;
  committed: number;
  skipped: number;
  failed: number;
  newProductsCreated: number;
  needsSpecs: number;
  needsImages: number;
  products: CommittedProduct[];
}
```

### Preview Response

```typescript
export interface PreviewResponse {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  validRows: PreviewValidRow[];
  invalidRows: PreviewInvalidRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

## Helper Functions (Spec Normalization)

```typescript
// RAM: "8 gb" → "8GB"
export function normalizeMemorySize(value: string): string;

// Storage: "256 gb" → "256GB"
export function normalizeStorageSize(value: string): string;

// Screen: "6.7 inches" → "6.7\""
export function normalizeScreenSize(value: string): string;

// Battery: "5000 mah" → "5000mAh"
export function normalizeBattery(value: string): string;

// Product name: "iPhone 15 Pro  256GB" → "iphone 15 pro 256gb"
export function normalizeProductName(name: string): string;

// Spec key: "Screen Size" → "screen_size"
export function normalizeSpecKey(key: string): string;
```

## Tech Category Constants

```typescript
export const TECH_CATEGORIES = [
  'smartphones', 'phones', 'mobile phones',
  'laptops', 'notebooks', 'computers',
  'tablets', 'ipads',
  'tvs', 'televisions',
  'cameras', 'dslr',
  'gaming consoles', 'consoles',
  'smartwatches', 'wearables',
  'headphones', 'earbuds', 'speakers',
  'monitors', 'printers', 'routers', 'networking'
] as const;

export const DEFAULT_SPEC_REQUIREMENTS: Record<string, { required: string[]; optional: string[] }> = {
  smartphones: {
    required: ['ram', 'storage', 'screen_size'],
    optional: ['color', 'battery', 'camera', 'warranty', 'weight']
  },
  laptops: {
    required: ['ram', 'storage', 'processor', 'screen_size'],
    optional: ['color', 'graphics', 'os', 'warranty', 'weight', 'battery_life']
  },
  tvs: {
    required: ['screen_size', 'resolution'],
    optional: ['smart_tv', 'refresh_rate', 'warranty', 'hdr']
  },
  // ... more categories
};
```

---

# 5. Core Services

## 5.1 BulkUploadStagingService

**Location**: `src/services/bulkUploadStaging.service.ts`

### Purpose

Handles the v4.0 staging pipeline: parsing Excel files, inserting into staging table, validation, preview generation, and commit/cancel operations.

### Key Methods

#### `generateBatchId(shopId: string): string`

Generates unique batch identifier.

```typescript
// Output format: "{shop_prefix}-{timestamp_base36}-{random}"
// Example: "abc12345-lx7h9k2-f9a3"
```

#### `canShopBulkUpload(shopId: string): Promise<{allowed: boolean, reason?: string}>`

Checks if shop has bulk upload permission and pending batch limit.

```typescript
const result = await stagingService.canShopBulkUpload(shopId);
if (!result.allowed) {
  throw new Error(result.reason);
}
```

#### `insertStagingRows(shopId, batchId, bulkUploadId, parsedRows, parseErrors)`

Inserts parsed rows and error rows into staging table.

```typescript
const { inserted, errorRows } = await stagingService.insertStagingRows(
  shopId,
  batchId,
  bulkUploadId,
  parsedRows,   // Successfully parsed rows
  parseErrors   // Rows that failed to parse
);
```

#### `validateStagingBatch(shopId, batchId): Promise<StagingSummary>`

Validates all staging rows:
1. Product name required
2. Price must be positive
3. Stock must be non-negative
4. Category must exist (if provided)
5. Tech specs validated against rules
6. Duplicate detection

```typescript
const summary = await stagingService.validateStagingBatch(shopId, batchId);
// summary.valid, summary.invalid, summary.willNeedSpecs, etc.
```

#### `getPreview(shopId, batchId, page, showInvalid): Promise<PreviewResponse>`

Returns paginated preview of staging rows.

```typescript
const preview = await stagingService.getPreview(shopId, batchId, 1, false);
// preview.validRows, preview.invalidRows, preview.pagination
```

#### `commitBatch(shopId, batchId): Promise<CommitSummary>`

Commits valid rows to production:
1. Creates parent products (if not matched)
2. Creates shop_products with appropriate listing_status
3. Updates staging rows to COMMITTED
4. Updates bulk_uploads record

```typescript
const result = await stagingService.commitBatch(shopId, batchId);
// result.committed, result.newProductsCreated, result.needsImages
```

#### `cancelBatch(shopId, batchId): Promise<void>`

Cancels batch and deletes staging rows.

```typescript
await stagingService.cancelBatch(shopId, batchId);
```

#### `cleanupOldStaging(): Promise<number>`

Deletes staging rows older than retention period.

```typescript
const deletedCount = await stagingService.cleanupOldStaging();
```

---

## 5.2 BulkUploadCorrectionService

**Location**: `src/services/bulkUploadCorrection.service.ts`

### Purpose

Generates correction Excel files for invalid rows and manages spec updates.

### Key Methods

#### `generateCorrectionFile(batchId): Promise<Buffer>`

Creates Excel workbook with invalid rows and error annotations.

```typescript
const xlsxBuffer = await correctionService.generateCorrectionFile(batchId);
// Returns XLSX file as Buffer
```

**Output Sheets**:
1. **Corrections**: Invalid rows with original data + ERRORS column
2. **Error Summary**: Aggregated error counts by type
3. **Instructions**: How to fix and re-upload

#### `getCorrectionPreview(batchId, limit): Promise<CorrectionPreview>`

Returns preview without file generation.

```typescript
const preview = await correctionService.getCorrectionPreview(batchId, 20);
// { total, preview: [...], errorSummary: { price: 5, ram: 10 } }
```

#### `getProductsNeedingSpecs(shopId, page, limit)`

Lists products with `NEEDS_SPECS` status.

```typescript
const products = await correctionService.getProductsNeedingSpecs(shopId, 1, 20);
// Returns paginated list of products missing required specs
```

#### `updateProductSpecs(shopProductId, specs)`

Updates tech specs on a product.

```typescript
await correctionService.updateProductSpecs(shopProductId, {
  ram: '8GB',
  storage: '256GB',
  screen_size: '6.7"'
});
```

---

## 5.3 ProductMatchingService

**Location**: `src/services/productMatching.service.ts`

### Purpose

Advanced product matching with fuzzy search and verified product prioritization.

### Matching Pipeline (v4.0)

```
Step 1: Exact match on normalized_name
   └─ If verified exact match found → return immediately

Step 2: Fuzzy match with pg_trgm (threshold: 0.8)
   └─ Falls back to local trigram similarity if pg_trgm unavailable
   └─ Boosts verified products by +15%

Step 3: Brand + Category match
   └─ Matches products with same brand AND category
   └─ Applies brand (+5%) and category (+5%) boosts

Step 4: Keyword/Alias match
   └─ Searches products.keywords[] and products.aliases[]
```

### Key Methods

#### `findMatchingProductAdvanced(input): Promise<AdvancedMatchResult>`

Main matching method using multi-step pipeline.

```typescript
const result = await productMatchingService.findMatchingProductAdvanced({
  productName: 'iPhone 15 Pro 256GB',
  brand: 'Apple',
  categoryName: 'Smartphones'
});

// Result:
{
  matched: true,
  product: { id, name, brand, isVerified, finalScore, ... },
  allCandidates: [...],
  matchType: 'fuzzy',
  confidence: 92.5,
  explanation: 'Matched via fuzzy (verified) with 92.5% confidence'
}
```

### Scoring Formula

```
finalScore = similarity 
  + (isVerified ? 0.15 : 0)      // Verified product boost
  + (matchType === 'exact' ? 0.10 : 0)  // Exact match boost
  + (brandMatches ? 0.05 : 0)    // Brand match boost
  + (categoryMatches ? 0.05 : 0) // Category match boost
```

### Configuration

```typescript
const CONFIG = {
  FUZZY_SIMILARITY_THRESHOLD: 0.8,  // Minimum score to accept
  MAX_CANDIDATES_PER_STEP: 10,
  VERIFIED_BOOST: 0.15,
  EXACT_MATCH_BOOST: 0.10,
  BRAND_MATCH_BOOST: 0.05,
  CATEGORY_MATCH_BOOST: 0.05
};
```

---

# 6. Middleware & Security

## 6.1 BulkUploadGovernance Middleware

**Location**: `src/middleware/bulkUploadGovernance.middleware.ts`

### Purpose

Enforces shop-level permissions and ownership verification for bulk upload operations.

### Exported Middleware Functions

#### `canBulkUpload`

Checks shop has `can_bulk_upload = true` and user owns the shop.

```typescript
router.post('/bulk',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  canBulkUpload,  // ← Permission check
  uploadExcel,
  bulkUploadController.bulkUpload
);
```

**Returns 403 if**:
- Shop not found
- User doesn't own shop
- `can_bulk_upload = false`

**Error Message (bilingual)**:
```
"Your shop is not authorized for bulk uploads. / Sitolo yanu ilibe chilolezo choika katundu wambiri nthawi imodzi."
```

#### `verifyBatchOwnership`

Verifies batch belongs to user's shop.

```typescript
router.post('/bulk/:batchId/commit',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  verifyBatchOwnership,  // ← Ownership check
  bulkUploadController.commitStagingBatch
);
```

**Attaches to request**:
```typescript
req.batch = { id, batchId, shopId, shopName, status, totalRows };
req.shop = { id, name };
```

#### `checkPendingBatchLimit`

Enforces maximum pending batches per shop (default: 3).

```typescript
router.post('/bulk',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  canBulkUpload,
  checkPendingBatchLimit,  // ← Rate limit
  uploadExcel,
  bulkUploadController.bulkUpload
);
```

**Returns 429 if**:
```
"You have 3 pending uploads. Please commit or cancel them before starting a new one."
```

#### `adminBulkUploadAccess`

Admin-only access that bypasses ownership checks.

```typescript
router.get('/admin/bulk/:batchId',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN'),
  adminBulkUploadAccess,  // ← Admin bypass
  bulkUploadController.getUploadDetails
);
```

### Error Messages (Bilingual)

| Error | English | Chichewa |
|-------|---------|----------|
| SHOP_NOT_FOUND | Shop not found. | Sitolo sinapezeke. |
| NOT_AUTHORIZED | Your shop is not authorized for bulk uploads. | Sitolo yanu ilibe chilolezo choika katundu wambiri nthawi imodzi. |
| SHOP_INACTIVE | Your shop is currently inactive. | Sitolo yanu inali itatsekeredwa. |
| NOT_OWNER | You do not have permission to upload to this shop. | Mulibe chilolezo choyikira katundu mu sitolo iyi. |
| BATCH_NOT_FOUND | Upload batch not found. | Batch yomwe munaika sinapezeke. |
| BATCH_WRONG_SHOP | This batch does not belong to your shop. | Batch iyi si ya sitolo yanu. |

---

# 7. API Reference

## Base Path: `/api/shops/:shopId/products`

## Upload & Staging Endpoints

### `POST /bulk` - Upload Excel File

Upload and stage products for processing.

**Request**:
```http
POST /api/shops/{shopId}/products/bulk
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [Excel file]
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "batchId": "abc12345-lx7h9k2-f9a3",
    "uploadId": "uuid-here",
    "totalRows": 150,
    "templateType": "ELECTRONICS",
    "status": "STAGING",
    "nextStep": "GET /bulk/{batchId}/preview"
  }
}
```

**Errors**:
- `400`: Invalid file format
- `403`: Shop not authorized
- `429`: Pending batch limit exceeded

---

### `GET /bulk/:batchId/preview` - Get Staging Preview

**Request**:
```http
GET /api/shops/{shopId}/products/bulk/{batchId}/preview?page=1&showInvalid=false
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "batchId": "abc12345-lx7h9k2-f9a3",
    "summary": {
      "total": 150,
      "valid": 120,
      "invalid": 25,
      "skipped": 5
    },
    "validRows": [
      {
        "rowNumber": 1,
        "productName": "iPhone 15 Pro 256GB",
        "brand": "Apple",
        "sku": "APL-IP15P-256",
        "basePrice": 1899.00,
        "displayPrice": 1999.00,
        "targetStatus": "NEEDS_IMAGES",
        "matchedProduct": "iPhone 15 Pro",
        "willCreateProduct": false,
        "variantValues": { "storage": "256GB", "color": "Black" }
      }
    ],
    "invalidRows": [
      {
        "rowNumber": 45,
        "productName": "Samsung TV",
        "errors": [
          { "row": 45, "field": "screen_size", "message": "Required tech spec missing" },
          { "row": 45, "field": "price", "message": "Price must be greater than 0" }
        ],
        "rawData": { ... }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

### `POST /bulk/:batchId/commit` - Commit Batch

**Request**:
```http
POST /api/shops/{shopId}/products/bulk/{batchId}/commit
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "batchId": "abc12345-lx7h9k2-f9a3",
    "committed": 120,
    "skipped": 5,
    "failed": 25,
    "newProductsCreated": 15,
    "needsSpecs": 10,
    "needsImages": 95,
    "products": [
      {
        "id": "uuid",
        "productName": "iPhone 15 Pro 256GB",
        "sku": "APL-IP15P-256",
        "basePrice": 1899.00,
        "displayPrice": 1999.00,
        "listingStatus": "NEEDS_IMAGES",
        "isNewProduct": false
      }
    ]
  }
}
```

---

### `DELETE /bulk/:batchId/cancel` - Cancel Batch

**Request**:
```http
DELETE /api/shops/{shopId}/products/bulk/{batchId}/cancel
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Batch cancelled successfully"
}
```

---

### `GET /bulk/:batchId/corrections` - Download Correction File

**Request**:
```http
GET /api/shops/{shopId}/products/bulk/{batchId}/corrections
Authorization: Bearer {token}
```

**Response**: Excel file download (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

---

### `GET /bulk/:batchId/corrections/preview` - Preview Corrections

**Request**:
```http
GET /api/shops/{shopId}/products/bulk/{batchId}/corrections/preview?limit=20
Authorization: Bearer {token}
```

**Response** (200 OK):
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
          { "row": 45, "field": "screen_size", "message": "Required tech spec missing" }
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

---

### `GET /needs-specs` - Products Needing Specs

**Request**:
```http
GET /api/shops/{shopId}/products/needs-specs?page=1&limit=20
Authorization: Bearer {token}
```

**Response** (200 OK):
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
    "pagination": { "page": 1, "limit": 20, "total": 45, "pages": 3 }
  }
}
```

---

### `PATCH /:shopProductId/specs` - Update Product Specs

**Request**:
```http
PATCH /api/shops/{shopId}/products/{shopProductId}/specs
Authorization: Bearer {token}
Content-Type: application/json

{
  "specs": {
    "ram": "8",
    "storage": "256",
    "screen_size": "6.2"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Samsung Galaxy S24",
    "techSpecs": { "ram": "8GB", "storage": "256GB", "screen_size": "6.2\"" },
    "listingStatus": "NEEDS_IMAGES"
  }
}
```

---

# 8. Data Flow & Pipelines

## Complete Upload Flow

```
1. UPLOAD PHASE
   ├── Seller uploads Excel via POST /bulk
   ├── Middleware checks:
   │   ├── canBulkUpload (shop permission)
   │   └── checkPendingBatchLimit (max 3)
   ├── Multer saves file to temp storage
   ├── Generate unique batchId
   ├── Create bulk_uploads record (status: STAGING)
   └── Parse Excel with XLSX library

2. STAGING PHASE
   ├── Detect template type (ELECTRONICS/GENERAL)
   ├── For each row:
   │   ├── Parse raw data into typed fields
   │   ├── Calculate display price (base_price × 1.0526)
   │   ├── Insert into bulk_upload_staging
   │   └── Set validation_status = PENDING
   └── Return batchId to client

3. VALIDATION PHASE (automatic)
   ├── For each PENDING row:
   │   ├── Validate required fields
   │   │   ├── Product name: non-empty
   │   │   ├── Price: positive number
   │   │   └── Stock: non-negative integer
   │   ├── Match to parent product (fuzzy search)
   │   │   ├── Prioritize verified products
   │   │   └── Use 0.8 similarity threshold
   │   ├── Check for duplicates (SKU or name+variants)
   │   ├── Validate tech specs (if tech category)
   │   ├── Determine target listing status
   │   │   ├── Has specs + has images → PENDING_REVIEW
   │   │   ├── Has specs + no images → NEEDS_IMAGES
   │   │   └── Missing specs → NEEDS_SPECS
   │   └── Update validation_status
   └── Update bulk_uploads with counts

4. PREVIEW PHASE
   ├── Client requests GET /bulk/:batchId/preview
   ├── Return paginated valid/invalid rows
   └── Include error summary and next steps

5. DECISION PHASE
   │
   ├── OPTION A: COMMIT
   │   ├── For each VALID row:
   │   │   ├── Create parent product (if not matched)
   │   │   └── Create shop_product
   │   ├── Delete staging rows
   │   └── Update bulk_uploads (status: COMPLETED)
   │
   ├── OPTION B: CANCEL
   │   ├── Delete all staging rows
   │   └── Update bulk_uploads (status: CANCELLED)
   │
   └── OPTION C: DOWNLOAD CORRECTIONS
       ├── Generate Excel with invalid rows
       ├── Include error annotations
       └── User fixes and re-uploads
```

## Product Status Flow

```
UPLOAD → NEEDS_IMAGES → [Add Images] → PENDING_REVIEW → [Admin Approve] → LIVE
                    ↘
                     NEEDS_SPECS → [Add Specs] → NEEDS_IMAGES → ...
```

---

# 9. Validation Engine

## Field Validation Rules

| Field | Rule | Error Code |
|-------|------|------------|
| `product_name` | Required, non-empty | MISSING_REQUIRED |
| `price` / `base_price` | Required, > 0 | INVALID_PRICE |
| `stock_quantity` | Required, >= 0 | INVALID_STOCK |
| `category` | Must exist in categories table | INVALID_CATEGORY |
| `condition` | Must be valid enum value | INVALID_CONDITION |

## Tech Spec Validation

### Detection

A category is considered "tech" if its normalized name contains any of:
- smartphones, phones, laptops, notebooks, tablets
- tvs, televisions, cameras, gaming consoles
- smartwatches, headphones, speakers, monitors

### Required Specs by Category

```typescript
// Smartphones
required: ['ram', 'storage', 'screen_size']

// Laptops  
required: ['ram', 'storage', 'processor', 'screen_size']

// TVs
required: ['screen_size', 'resolution']

// Cameras
required: ['megapixels']
```

### Validation Flow

```typescript
async function validateTechSpecs(categoryName, specs) {
  // 1. Check if tech category
  if (!isTechCategory(categoryName)) {
    return { targetStatus: 'NEEDS_IMAGES' };
  }
  
  // 2. Get rules from database or defaults
  const rules = await getSpecRules(categoryName);
  
  // 3. Find missing required specs
  const missing = rules.required.filter(spec => !specs[spec]);
  
  // 4. Determine target status
  if (missing.length > 0) {
    return { targetStatus: 'NEEDS_SPECS', missingRequired: missing };
  }
  
  return { targetStatus: 'NEEDS_IMAGES' };
}
```

## Duplicate Detection

A row is marked as SKIPPED (duplicate) if:

```sql
SELECT EXISTS (
  SELECT 1 FROM shop_products sp
  JOIN products p ON sp.product_id = p.id
  WHERE sp.shop_id = :shopId
  AND (
    -- SKU match (if provided)
    (sp.sku = :inputSku AND :inputSku IS NOT NULL)
    OR
    -- Name + variants match
    (LOWER(p.name) = LOWER(:inputName) AND sp.variant_values = :inputVariants)
  )
)
```

---

# 10. Product Matching System

## Matching Pipeline

```
INPUT: Product name, brand, category

STEP 1: Exact Match
├── Query: WHERE normalized_name = :input
├── Priority: Return verified product immediately
└── Score: 1.0

STEP 2: Fuzzy Match (pg_trgm or local)
├── Query: WHERE similarity(normalized_name, :input) > 0.65
├── Boost: +15% for verified products
└── Threshold: 0.8 to accept

STEP 3: Brand + Category
├── Query: WHERE brand = :brand AND category = :category
├── Boost: +5% brand, +5% category
└── Apply trigram similarity for ranking

STEP 4: Keywords/Aliases
├── Query: WHERE keywords @> [:input_words] OR aliases @> [:input_words]
└── Apply trigram similarity for ranking

OUTPUT: Best match (if score >= 0.8) or no match
```

## Scoring System

| Factor | Boost |
|--------|-------|
| Verified product (status = APPROVED) | +15% |
| Exact match | +10% |
| Brand matches | +5% |
| Category matches | +5% |

**Example**:
```
Input: "iPhone 15 Pro 256GB"
Match: "iPhone 15 Pro" (verified)

Similarity: 0.85
+ Verified: 0.15
+ Brand match: 0.05
= Final Score: 1.05 → capped at 1.0

Result: MATCHED with 100% confidence
```

## pg_trgm Setup (Recommended)

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index
CREATE INDEX idx_products_normalized_name_trgm 
ON products USING GIN (normalized_name gin_trgm_ops);

-- Test similarity
SELECT similarity('iphone 15 pro', 'iPhone 15 Pro 256GB');
-- Returns: 0.68
```

---

# 11. File Formats & Templates

## Upload Template (GENERAL)

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Product Name | String | ✅ Yes | Name of the product |
| Category | String | ✅ Yes | Category name (must exist) |
| Brand | String | No | Brand name |
| SKU | String | No | Seller's SKU code |
| Base Price | Number | ✅ Yes | Seller's price (before markup) |
| Stock Quantity | Integer | ✅ Yes | Available stock |
| Condition | String | No | NEW, REFURBISHED, USED_GOOD, etc. |
| Description | String | No | Product description |

## Upload Template (ELECTRONICS)

All GENERAL columns plus:

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| RAM | String | Category-dependent | e.g., "8GB" |
| Storage | String | Category-dependent | e.g., "256GB" |
| Screen Size | String | Category-dependent | e.g., "6.7"" |
| Processor | String | Category-dependent | e.g., "A17 Pro" |
| Battery | String | No | e.g., "5000mAh" |
| Resolution | String | Category-dependent | e.g., "4K" |
| Color | String | No | e.g., "Black" |

## Correction File Format

**Sheet 1: "Corrections"**

| Column | Description |
|--------|-------------|
| Row Number | Original row number |
| Status | INVALID or SKIPPED |
| Product Name | Original value |
| Category | Original value |
| ... | All other columns |
| ERRORS | Concatenated error messages |

**Sheet 2: "Error Summary"**

| Error Type | Count | Affected Fields | Sample Message |
|------------|-------|-----------------|----------------|
| MISSING_REQUIRED | 15 | ram, storage | Required tech spec missing |
| INVALID_PRICE | 8 | price | Price must be greater than 0 |

**Sheet 3: "Instructions"**

Step-by-step guide for fixing and re-uploading.

---

# 12. CLI Tools

## sankha-process-batch.ts

Force commit a batch from command line (admin use).

```bash
npx ts-node scripts/sankha-process-batch.ts <batch_id> [options]

Options:
  --dry-run     Preview without committing
  --verbose     Show detailed output
  --shop-id     Override shop ID (admin only)

Examples:
  npx ts-node scripts/sankha-process-batch.ts abc123-lx7h9k2-f9a3
  npx ts-node scripts/sankha-process-batch.ts abc123-lx7h9k2-f9a3 --dry-run
```

## sankha-generate-correction.ts

Export correction file from command line.

```bash
npx ts-node scripts/sankha-generate-correction.ts <batch_id> [options]

Options:
  --output, -o    Output file path
  --format, -f    xlsx or csv (default: xlsx)
  --verbose, -v   Show detailed output
  --include-raw   Include raw data columns

Examples:
  npx ts-node scripts/sankha-generate-correction.ts abc123
  npx ts-node scripts/sankha-generate-correction.ts abc123 -o ./corrections.xlsx
  npx ts-node scripts/sankha-generate-correction.ts abc123 --format csv
```

---

# 13. Background Jobs

## Bulk Upload Cleanup Job

**Location**: `src/jobs/bulkUploadCleanup.job.ts`

### Purpose

Automated cleanup of stale staging data and abandoned batches.

### Configuration

```env
STAGING_RETENTION_HOURS=24        # Delete staging rows after 24h
ABANDONED_BATCH_HOURS=48          # Cancel abandoned batches after 48h
COMPLETED_BATCH_RETENTION_DAYS=30 # Delete old records after 30d
CLEANUP_CRON_SCHEDULE=0 0 * * *   # Midnight daily
ENABLE_SCHEDULED_CLEANUP=true
TZ=Africa/Blantyre                # Timezone
```

### Service Methods

```typescript
// Get cleanup statistics
const stats = await bulkUploadCleanupService.getCleanupStats();

// Run full cleanup
const result = await bulkUploadCleanupService.runFullCleanup();

// Manual batch cleanup
await bulkUploadCleanupService.cleanupBatch(batchId);

// Cleanup all batches for a shop
await bulkUploadCleanupService.cleanupShopBatches(shopId);
```

### Starting the Scheduler

```typescript
// In server.ts
import { startCleanupScheduler } from './jobs/bulkUploadCleanup.job';

// After app.listen()
startCleanupScheduler();
```

### Installation

```bash
npm install node-cron
npm install -D @types/node-cron
```

---

# 14. Error Handling

## Error Types

| Code | Description |
|------|-------------|
| `MISSING_REQUIRED` | Required field is empty |
| `INVALID_FORMAT` | Wrong data format |
| `INVALID_PRICE` | Price <= 0 or non-numeric |
| `INVALID_STOCK` | Stock < 0 or non-integer |
| `INVALID_CATEGORY` | Category not found |
| `INVALID_CONDITION` | Unknown condition value |
| `DUPLICATE` | Product already exists |
| `MISSING_SPEC` | Required tech spec missing |
| `INVALID_SPEC` | Tech spec value invalid |
| `SYSTEM_ERROR` | Internal error |

## Error Object Structure

```typescript
interface RowError {
  row: number;      // Row number in Excel (1-indexed)
  field: string;    // Field/column name
  message: string;  // Human-readable message
  code?: string;    // Error type code
}
```

## HTTP Error Responses

| Status | Scenario |
|--------|----------|
| 400 | Invalid file format, missing required fields |
| 401 | Not authenticated |
| 403 | Shop not authorized, batch ownership failed |
| 404 | Batch/product not found |
| 409 | Batch already committed/cancelled |
| 422 | Validation errors (returns error details) |
| 429 | Rate limit (pending batch limit) |
| 500 | Internal server error |

---

# 15. Configuration

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Upload limits
MAX_BULK_UPLOAD_SIZE=10485760     # 10MB
MAX_BULK_ROWS=500                  # Max rows per file

# Staging
STAGING_RETENTION_HOURS=24
ABANDONED_BATCH_HOURS=48
COMPLETED_BATCH_RETENTION_DAYS=30

# Cleanup scheduler
CLEANUP_CRON_SCHEDULE=0 0 * * *   # Cron expression
ENABLE_SCHEDULED_CLEANUP=true
TZ=Africa/Blantyre

# Matching
FUZZY_MATCH_THRESHOLD=0.8         # 0.0-1.0

# Pricing
PRICE_MARKUP_MULTIPLIER=1.0526    # 5.26% markup
```

## Service Configuration

```typescript
// bulkUploadStaging.service.ts
const CONFIG = {
  MAX_ROWS_PER_UPLOAD: 500,
  MAX_PENDING_BATCHES_PER_SHOP: 3,
  STAGING_RETENTION_DAYS: 7,
  PREVIEW_PAGE_SIZE: 50
};

// productMatching.service.ts
const CONFIG = {
  FUZZY_SIMILARITY_THRESHOLD: 0.8,
  MAX_CANDIDATES_PER_STEP: 10,
  VERIFIED_BOOST: 0.15,
  EXACT_MATCH_BOOST: 0.10,
  BRAND_MATCH_BOOST: 0.05,
  CATEGORY_MATCH_BOOST: 0.05
};
```

---

# 16. Deployment Guide

## Prerequisites

1. **PostgreSQL 14+** with `pg_trgm` extension
2. **Node.js 18+**
3. **npm** or **yarn**

## Installation Steps

```bash
# 1. Install dependencies
npm install
npm install node-cron
npm install -D @types/node-cron

# 2. Enable pg_trgm (optional but recommended)
psql -d your_database -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# 3. Run migrations
npx prisma migrate deploy

# 4. Generate Prisma client
npx prisma generate
```

## Verification Checklist

- [ ] `shops.can_bulk_upload` column exists (default: true)
- [ ] `bulk_upload_staging` table created
- [ ] `tech_spec_rules` table created with seed data
- [ ] `listing_status` enum includes `NEEDS_IMAGES`, `NEEDS_SPECS`, `BROKEN`
- [ ] `upload_status` enum includes `STAGING`, `CANCELLED`
- [ ] pg_trgm extension enabled (optional)
- [ ] node-cron installed (for scheduled cleanup)

## Server Integration

```typescript
// server.ts
import express from 'express';
import { startCleanupScheduler } from './jobs/bulkUploadCleanup.job';

const app = express();

// ... routes and middleware ...

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start cleanup scheduler
  startCleanupScheduler();
});
```

## Monitoring

```typescript
// Admin endpoint for cleanup stats
router.get('/admin/bulk-upload/cleanup-stats', async (req, res) => {
  const stats = await bulkUploadCleanupService.getCleanupStats();
  res.json({ success: true, data: stats });
});

// Manual cleanup trigger
router.post('/admin/bulk-upload/cleanup', async (req, res) => {
  const result = await bulkUploadCleanupService.runFullCleanup();
  res.json({ success: true, data: result });
});
```

---

# Appendix A: Quick Reference

## Route Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bulk/template` | Download upload template |
| POST | `/bulk` | Upload Excel file |
| GET | `/bulk/history` | Get upload history |
| GET | `/bulk/:uploadId` | Get upload details |
| GET | `/bulk/:batchId/preview` | Preview staging |
| POST | `/bulk/:batchId/commit` | Commit batch |
| DELETE | `/bulk/:batchId/cancel` | Cancel batch |
| GET | `/bulk/:batchId/corrections` | Download corrections |
| GET | `/bulk/:batchId/corrections/preview` | Preview corrections |
| GET | `/needs-images` | Products needing images |
| GET | `/needs-specs` | Products needing specs |
| PATCH | `/:shopProductId/specs` | Update specs |

## Middleware Chain (Upload)

```
protect → authorize → canBulkUpload → checkPendingBatchLimit → uploadExcel → handler
```

## Middleware Chain (Batch Operations)

```
protect → authorize → verifyBatchOwnership → handler
```

---

# Appendix B: Troubleshooting

## Common Issues

### "Shop is not authorized for bulk uploads"

```sql
-- Enable bulk upload for a shop
UPDATE shops SET can_bulk_upload = true WHERE id = 'shop-uuid';
```

### "pg_trgm extension not found"

```sql
-- Install extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Stale staging data

```typescript
// Manually trigger cleanup
await bulkUploadCleanupService.runFullCleanup();
```

### Batch stuck in STAGING

```bash
# Force commit via CLI
npx ts-node scripts/sankha-process-batch.ts <batch_id>

# Or cancel
npx prisma db execute --file - <<< "DELETE FROM bulk_upload_staging WHERE batch_id = 'xxx';"
```

---

*Document Version: 4.0.0*  
*Last Updated: February 2026*  
*Shop-Tech Backend*
