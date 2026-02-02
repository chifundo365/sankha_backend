# Bulk Upload System Documentation

> **Purpose**: This document explains the bulk product upload functionality for the ShopTech/Sankha e-commerce platform. It is written to be understood by both humans and AI systems.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow Diagram](#data-flow-diagram)
4. [Excel Template Structure](#excel-template-structure)
5. [Processing Logic](#processing-logic)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Business Rules](#business-rules)
9. [Error Handling](#error-handling)
10. [Post-Upload Workflow](#post-upload-workflow)

---

## Overview

### What is Bulk Upload?

Bulk upload allows sellers to add multiple products to their shop inventory at once by uploading an Excel file (.xlsx) instead of adding products one by one through the UI.

### Key Characteristics

| Attribute | Value |
|-----------|-------|
| Max products per upload | 200 rows |
| File format | `.xlsx` (Excel) |
| Initial product status | `NEEDS_IMAGES` |
| Products visible to buyers? | No (until images added) |
| Email notification | Yes (summary sent to seller) |

---

## System Architecture

### File Structure

```
src/
├── controllers/
│   └── bulkUpload.controller.ts    # HTTP request handlers
├── services/
│   └── bulkUpload.service.ts       # Core business logic
├── routes/
│   └── shop-product.routes.ts      # Route definitions
└── templates/
    └── email.templates.ts          # Email HTML templates
```

### Dependencies

```json
{
  "xlsx": "^0.18.x"       // Excel file parsing
  "prisma": "^5.x"        // Database ORM
  "cloudinary": "^1.x"    // Image uploads (post bulk-upload)
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BULK UPLOAD FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: TEMPLATE DOWNLOAD
─────────────────────────
    [Seller] ──GET /template──> [Server] ──returns──> [Excel File]
    
    Output: sankha-bulk-upload-template.xlsx
    Contains: Headers + Sample Data + Instructions Sheet


STEP 2: SELLER FILLS DATA
─────────────────────────
    [Seller] fills Excel with product data:
    - Product Name (required)
    - Base Price in MWK (required)  
    - Stock Quantity (required)
    - Category, Brand, SKU, Condition, Description, Specs (optional)


STEP 3: FILE UPLOAD
───────────────────
    [Seller] ──POST /bulk + file──> [Server]
    
    Request:
    {
      method: "POST",
      url: "/api/shops/:shopId/products/bulk",
      headers: { "Content-Type": "multipart/form-data" },
      body: FormData with Excel file
    }


STEP 4: SERVER PROCESSING
─────────────────────────
    ┌─────────────────────────────────────────────────────────────┐
    │                    PROCESSING PIPELINE                      │
    ├─────────────────────────────────────────────────────────────┤
    │                                                             │
    │  4.1 VALIDATION                                             │
    │  ├── Check file exists                                      │
    │  ├── Check file type (.xlsx)                                │
    │  ├── Check shop ownership                                   │
    │  └── Check row count <= 200                                 │
    │                                                             │
    │  4.2 PARSE EXCEL                                            │
    │  ├── Read "Products" sheet (or first sheet)                 │
    │  ├── Convert rows to JSON objects                           │
    │  ├── Validate required columns exist                        │
    │  └── Validate each row's data types                         │
    │                                                             │
    │  4.3 PROCESS EACH ROW                                       │
    │  ├── Generate SKU if missing                                │
    │  ├── Find or create base product                            │
    │  ├── Check for duplicates                                   │
    │  ├── Calculate display price                                │
    │  └── Create shop_product record                             │
    │                                                             │
    │  4.4 RECORD UPLOAD                                          │
    │  ├── Create bulk_uploads record                             │
    │  └── Link created products to upload                        │
    │                                                             │
    │  4.5 SEND EMAIL                                             │
    │  └── Summary email to seller                                │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘


STEP 5: RESPONSE
────────────────
    [Server] ──returns──> [Seller]
    
    Response:
    {
      "success": true,
      "message": "Bulk upload completed: X products created, Y skipped, Z failed",
      "data": {
        "upload_id": "uuid",
        "summary": {
          "total_rows": 50,
          "successful": 45,
          "skipped": 3,
          "failed": 2
        },
        "products": [...created products...],
        "errors": [...error details...],
        "next_steps": {
          "message": "Products created with 'Needs Images' status...",
          "endpoint": "/api/shops/:shopId/products/needs-images"
        }
      }
    }


STEP 6: POST-UPLOAD (SELLER ACTION REQUIRED)
────────────────────────────────────────────
    [Seller] must add images to each product:
    
    GET  /api/shops/:shopId/products/needs-images   → List products needing images
    POST /api/shops/:shopId/products/:id/images     → Upload images
    
    Once images added → listing_status changes to "ACTIVE"
                      → is_available = true
                      → Product visible to buyers
```

---

## Excel Template Structure

### Sheet 1: Instructions

Contains human-readable instructions for filling the template.

### Sheet 2: Products

| Column Name | Internal Key | Type | Required | Validation |
|-------------|--------------|------|----------|------------|
| Product Name | `product_name` | string | ✅ | Non-empty |
| Category | `category_name` | string | ❌ | Must match existing category |
| Brand | `brand` | string | ❌ | - |
| SKU | `sku` | string | ❌ | Unique per shop (auto-generated if empty) |
| Base Price (MWK) | `base_price` | number | ✅ | > 0 |
| Stock Quantity | `stock_quantity` | integer | ✅ | >= 0 |
| Condition | `condition` | enum | ❌ | One of: NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, USED_FAIR |
| Description | `shop_description` | string | ❌ | - |
| Specs (JSON) | `specs` | JSON | ❌ | Valid JSON object |

### Sample Row

```
Product Name:     "iPhone 15 Pro Max 256GB"
Category:         "Smartphones"
Brand:            "Apple"
SKU:              "IP15PM-256-BLK"
Base Price (MWK): 1500000
Stock Quantity:   10
Condition:        "NEW"
Description:      "Brand new, sealed in box. 1 year warranty."
Specs (JSON):     {"storage": "256GB", "color": "Black Titanium", "ram": "8GB"}
```

---

## Processing Logic

### 5.1 SKU Auto-Generation

```
IF sku is empty or null THEN
    shopCode = first 6 uppercase alphanumeric chars of shop name
    dateCode = YYYYMMDD format of current date
    sequence = incrementing number starting at 001
    
    LOOP until unique:
        candidateSku = "{shopCode}-{dateCode}-{sequence}"
        IF candidateSku not in shop's existing SKUs:
            sku = candidateSku
            BREAK
        ELSE:
            sequence++
    
    Example: "TECHST-20260201-001"
```

### 5.2 Product Matching Logic

```
INPUT: product_name from Excel row

STEP 1: Normalize the name
    normalized = product_name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')      // collapse whitespace
        .replace(/[^\w\s]/g, '')   // remove special chars

STEP 2: Search for existing product
    product = SELECT FROM products 
              WHERE normalized_name = normalized
              OR name ILIKE '%{product_name}%'
              AND status = 'APPROVED'

STEP 3: Decision
    IF product found:
        USE existing product
    ELSE:
        CREATE new product with status = 'PENDING'
        (Requires admin approval before fully visible)
```

### 5.3 Price Calculation

```
CONSTANT: PRICE_MARKUP_MULTIPLIER = 1.0526  (5.26% platform fee)

FORMULA:
    display_price = ROUND(base_price × 1.0526, 2)

EXAMPLE:
    base_price    = 100,000 MWK  (seller receives this)
    display_price = 105,260 MWK  (buyer pays this)
    platform_fee  =   5,260 MWK  (platform keeps this)
```

### 5.4 Duplicate Detection

```
CHECK 1: SKU Duplicate
    IF shop_products WHERE shop_id = current AND sku = row.sku EXISTS:
        SKIP row
        ADD error: "Duplicate SKU already exists in your shop"

CHECK 2: Product Duplicate  
    IF shop_products WHERE shop_id = current AND product_id = matched_product.id EXISTS:
        SKIP row
        ADD error: "Product already exists in your shop inventory"
```

---

## Database Schema

### Tables Involved

```sql
-- Main product catalog (shared across all shops)
TABLE products {
    id              UUID PRIMARY KEY
    name            VARCHAR(255)
    normalized_name VARCHAR(255)    -- lowercase, no special chars
    brand           VARCHAR(100)
    category_id     UUID REFERENCES categories(id)
    base_price      DECIMAL(12,2)
    status          ENUM('PENDING', 'APPROVED', 'REJECTED')
    images          JSONB           -- array of image URLs
    created_at      TIMESTAMP
}

-- Shop-specific product listings
TABLE shop_products {
    id               UUID PRIMARY KEY
    shop_id          UUID REFERENCES shops(id)
    product_id       UUID REFERENCES products(id)
    sku              VARCHAR(50)
    base_price       DECIMAL(12,2)   -- seller's price
    price            DECIMAL(12,2)   -- display price (with markup)
    stock_quantity   INTEGER
    condition        ENUM('NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR')
    shop_description TEXT
    specs            JSONB
    images           JSONB           -- array of image URLs
    is_available     BOOLEAN         -- false until images added
    listing_status   ENUM('NEEDS_IMAGES', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK')
    bulk_upload_id   UUID REFERENCES bulk_uploads(id)
    created_at       TIMESTAMP
}

-- Upload tracking
TABLE bulk_uploads {
    id           UUID PRIMARY KEY
    shop_id      UUID REFERENCES shops(id)
    file_name    VARCHAR(255)
    total_rows   INTEGER
    successful   INTEGER
    failed       INTEGER
    skipped      INTEGER
    errors       JSONB           -- array of error objects
    status       ENUM('PROCESSING', 'COMPLETED', 'FAILED')
    completed_at TIMESTAMP
    created_at   TIMESTAMP
}
```

### Relationships

```
shops (1) ──────< (many) shop_products
products (1) ───< (many) shop_products
bulk_uploads (1) < (many) shop_products
```

---

## API Endpoints

### 1. Download Template

```http
GET /api/shops/:shopId/products/bulk/template

Response: Binary Excel file
Headers:
  Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Content-Disposition: attachment; filename=sankha-bulk-upload-template.xlsx
```

### 2. Upload Products

```http
POST /api/shops/:shopId/products/bulk

Headers:
  Authorization: Bearer <token>
  Content-Type: multipart/form-data

Body:
  file: <Excel file>

Response (201):
{
  "success": true,
  "message": "Bulk upload completed: 45 products created, 3 skipped, 2 failed",
  "data": {
    "upload_id": "550e8400-e29b-41d4-a716-446655440000",
    "summary": {
      "total_rows": 50,
      "successful": 45,
      "skipped": 3,
      "failed": 2
    },
    "products": [
      {
        "id": "uuid",
        "product_name": "iPhone 15 Pro",
        "sku": "TECH-20260201-001",
        "price": 1578900,
        "listing_status": "NEEDS_IMAGES"
      }
    ],
    "errors": [
      {
        "row": 12,
        "field": "Base Price",
        "message": "Base price must be a positive number"
      }
    ],
    "next_steps": {
      "message": "Products created with 'Needs Images' status. Add images to make them live.",
      "endpoint": "/api/shops/:shopId/products/needs-images"
    }
  }
}
```

### 3. Get Products Needing Images

```http
GET /api/shops/:shopId/products/needs-images?page=1&limit=20

Response (200):
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "product_name": "iPhone 15 Pro",
        "brand": "Apple",
        "category": "Smartphones",
        "sku": "TECH-20260201-001",
        "base_price": 1500000,
        "display_price": 1578900,
        "stock_quantity": 10,
        "condition": "NEW",
        "listing_status": "NEEDS_IMAGES",
        "created_at": "2026-02-01T10:30:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCount": 45,
      "limit": 20,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### 4. Get Upload History

```http
GET /api/shops/:shopId/bulk-uploads?page=1&limit=10

Response (200):
{
  "success": true,
  "data": {
    "uploads": [
      {
        "id": "uuid",
        "file_name": "products-feb-2026.xlsx",
        "total_rows": 50,
        "successful": 45,
        "failed": 2,
        "skipped": 3,
        "status": "COMPLETED",
        "completed_at": "2026-02-01T10:35:00Z",
        "created_at": "2026-02-01T10:30:00Z"
      }
    ],
    "pagination": {...}
  }
}
```

---

## Business Rules

### Rule 1: Shop Ownership

```
ONLY the shop owner OR admin users can upload products to a shop.

Check: shop.owner_id === request.user.id 
       OR request.user.role IN ('ADMIN', 'SUPER_ADMIN')
```

### Rule 2: Row Limit

```
Maximum 200 products per upload to prevent server overload.
If file contains > 200 rows → reject entire upload.
```

### Rule 3: Product Visibility

```
Products from bulk upload are NOT visible to buyers until:
1. listing_status = 'ACTIVE' (not 'NEEDS_IMAGES')
2. is_available = true
3. At least 1 image has been added
```

### Rule 4: New Products Require Approval

```
IF product_name doesn't match any existing approved product:
    CREATE new product with status = 'PENDING'
    This product needs admin approval before it appears in global catalog.
    
    However, the shop_product listing is still created and can go live
    once images are added (it references the pending product).
```

### Rule 5: Condition Default

```
IF condition column is empty OR invalid:
    condition = 'NEW'
```

---

## Error Handling

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| File Error | No file uploaded | Return 400, abort |
| File Type Error | Wrong format (.csv instead of .xlsx) | Return 400, abort |
| Permission Error | Not shop owner | Return 403, abort |
| Row Limit Error | > 200 rows | Return 400, abort |
| Parse Error | Invalid Excel structure | Return partial, log errors |
| Validation Error | Missing required field | Skip row, log error |
| Duplicate Error | SKU/Product exists | Skip row, log error |
| System Error | Database failure | Skip row, log error |

### Error Object Structure

```typescript
interface RowError {
  row: number;      // Excel row number (1-indexed + header = 2 for first data row)
  field: string;    // Column name that caused error
  message: string;  // Human-readable error message
}
```

### Error Response in Upload Result

```json
{
  "errors": [
    { "row": 5, "field": "Base Price", "message": "Base price must be a positive number" },
    { "row": 8, "field": "SKU", "message": "Duplicate SKU \"ABC-123\" already exists in your shop" },
    { "row": 12, "field": "Specs", "message": "Invalid JSON format in Specs column" }
  ]
}
```

---

## Post-Upload Workflow

### State Machine for shop_product

```
                    ┌─────────────────┐
                    │  BULK UPLOAD    │
                    │  (Excel file)   │
                    └────────┬────────┘
                             │
                             v
                    ┌─────────────────┐
                    │  NEEDS_IMAGES   │  ← Initial state
                    │  is_available:  │    No images yet
                    │     false       │    Not visible to buyers
                    └────────┬────────┘
                             │
                      [Seller adds images]
                             │
                             v
                    ┌─────────────────┐
                    │     ACTIVE      │  ← Live state
                    │  is_available:  │    Has images
                    │     true        │    Visible to buyers
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              v              v              v
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  INACTIVE  │  │OUT_OF_STOCK│  │  (deleted) │
     │  (manual)  │  │ (auto when │  │            │
     │            │  │  stock=0)  │  │            │
     └────────────┘  └────────────┘  └────────────┘
```

### Image Upload Flow (After Bulk Upload)

```
1. Seller calls GET /api/shops/:shopId/products/needs-images
   → Receives list of products without images

2. For each product, seller calls:
   POST /api/shops/:shopId/products/:productId/images
   Body: FormData with image files
   
3. Backend:
   - Uploads images to Cloudinary
   - Updates shop_product.images array
   - Changes listing_status from 'NEEDS_IMAGES' to 'ACTIVE'
   - Sets is_available = true
   
4. Product is now visible to buyers
```

---

## Email Notification

### Trigger

Email is sent automatically after bulk upload completes.

### Recipient

Shop owner's email address.

### Content

```
Subject: "Bulk Upload Complete - {X} products added"

Body:
- Summary table (total, successful, skipped, failed)
- Warning about "Needs Images" status
- List of first 10 errors (if any)
- CTA button: "Add Images to Products"
- Link to /seller/products/needs-images
```

---

## Code References

| Component | File Path |
|-----------|-----------|
| Controller | `src/controllers/bulkUpload.controller.ts` |
| Service | `src/services/bulkUpload.service.ts` |
| Routes | `src/routes/shop-product.routes.ts` |
| Email Template | `src/templates/email.templates.ts` |
| Price Constant | `src/utils/constants.ts` → `PRICE_MARKUP_MULTIPLIER` |
| Prisma Schema | `prisma/schema.prisma` |

---

## Summary for AI Agents

### If asked to modify bulk upload:

1. **Service logic** is in `src/services/bulkUpload.service.ts`
2. **HTTP handling** is in `src/controllers/bulkUpload.controller.ts`
3. **Database models**: `products`, `shop_products`, `bulk_uploads`
4. **Key functions**:
   - `generateTemplate()` - Creates Excel template
   - `parseExcelFile()` - Parses uploaded Excel
   - `processBulkUpload()` - Main processing logic
   - `getProductsNeedingImages()` - Lists products needing images
   - `sendUploadSummaryEmail()` - Sends notification email

### Key business logic:

- Display price = Base price × 1.0526
- SKU auto-generated as `{SHOPCODE}-{DATE}-{SEQ}`
- Products start as `NEEDS_IMAGES`, not visible until images added
- New products (no catalog match) created as `PENDING` (needs admin approval)
- Max 200 rows per upload

---

*Document last updated: February 2026*
