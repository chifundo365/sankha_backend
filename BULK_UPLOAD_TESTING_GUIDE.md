# Bulk Upload v4.0 - Complete Testing Guide

## 🎯 System Overview

The Bulk Upload v4.0 system follows this workflow:

```
1. UPLOAD → 2. STAGING → 3. VALIDATION → 4. PREVIEW → 5. ACTION (Commit/Cancel/Corrections)
```

## 📋 Key Concepts

### Status Flow
- **STAGING**: Uploaded, being validated
- **COMPLETED**: Valid rows committed to production
- **CANCELLED**: Seller cancelled the batch
- **FAILED**: System error during processing

### Listing Status (for products)
- **NEEDS_IMAGES**: Product created but has no images (not visible to buyers)
- **NEEDS_SPECS**: Missing required tech specifications
- **BROKEN**: Critical validation errors
- **LIVE**: Complete and visible to buyers

### Template Types
- **ELECTRONICS**: Uses `Spec:` columns (e.g., `Spec: RAM`, `Spec: Storage`)
- **GENERAL**: Uses `Label_x`/`Value_x` pairs (e.g., `Label_1`/`Value_1`)

---

## 🧪 Test Files Generated

| File | Description | Expected Results |
|------|-------------|------------------|
| `test-valid-electronics.xlsx` | 3 perfect electronics products | All valid, NEEDS_IMAGES status |
| `test-mixed-quality.xlsx` | 2 valid + 3 invalid products | 2 valid, 3 invalid with error messages |
| `test-missing-specs.xlsx` | 2 products with incomplete specs | Valid but NEEDS_SPECS status |
| `test-general-products.xlsx` | 2 general category products | Valid, uses Label/Value format |
| `test-comprehensive.xlsx` | Combined scenarios | Mix of all above |

---

## 🚀 Testing Steps

### Prerequisites
```bash
# Login to get access token (expires in 1 hour)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SHOP_ID="400e1a66-2540-40a5-a1e0-0e55f0d341f6"
```

---

### ✅ Test 1: Upload Valid Electronics

**Upload File:**
```bash
curl -X POST "http://localhost:3000/api/shops/$SHOP_ID/products/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-valid-electronics.xlsx"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "BULK-1738562400-abc123",
    "uploadId": "uuid-here",
    "totalRows": 3,
    "status": "STAGING",
    "templateType": "ELECTRONICS"
  }
}
```

**What happens:**
1. File parsed and stored in `bulk_upload_staging` table
2. Automatic validation runs
3. All 3 products should be VALID
4. Target status: `NEEDS_IMAGES` (no images uploaded yet)

---

### ✅ Test 2: Preview Staging Batch

**Get Preview:**
```bash
BATCH_ID="BULK-1738562400-abc123"  # From upload response

curl -X GET "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/$BATCH_ID/preview?page=1&showInvalid=false" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "BULK-1738562400-abc123",
    "summary": {
      "total": 3,
      "valid": 3,
      "invalid": 0,
      "willNeedSpecs": 0,
      "willNeedImages": 3
    },
    "validRows": [
      {
        "rowNumber": 1,
        "productName": "Samsung Galaxy S24 Ultra",
        "category": "Smartphones & Tablets",
        "brand": "Samsung",
        "basePrice": 1350000,
        "displayPrice": 1421010,
        "stockQuantity": 5,
        "specs": {
          "Storage": "256GB",
          "RAM": "12GB",
          "Screen Size": "6.8 inches"
        },
        "matchedProductId": null,
        "willCreateProduct": true,
        "targetListingStatus": "NEEDS_IMAGES"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 3
    }
  }
}
```

---

### ✅ Test 3: Commit Batch to Production

**Commit:**
```bash
curl -X POST "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/$BATCH_ID/commit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"skipInvalid": true}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "committed": 3,
    "skipped": 0,
    "newProductsCreated": 3,
    "existingProductsUpdated": 0,
    "needsImages": 3,
    "needsSpecs": 0,
    "committedProducts": [
      {
        "shopProductId": "uuid-1",
        "productId": "uuid-2",
        "productName": "Samsung Galaxy S24 Ultra",
        "sku": "CHI-SG-S24U",
        "listingStatus": "NEEDS_IMAGES"
      }
    ]
  }
}
```

**What happens:**
1. Creates parent `products` records (if not matched)
2. Creates `shop_products` records with listing_status = NEEDS_IMAGES
3. Deletes staging rows
4. Updates bulk_uploads status to COMPLETED
5. Sends email notification to seller

---

### ✅ Test 4: Upload Mixed Quality Data

**Upload:**
```bash
curl -X POST "http://localhost:3000/api/shops/$SHOP_ID/products/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-mixed-quality.xlsx"
```

**Preview Invalid Rows:**
```bash
BATCH_ID="..." # From upload

curl -X GET "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/$BATCH_ID/preview?showInvalid=true" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
- 2 valid rows
- 3 invalid rows with errors:
  - "Product name is required" (EN) / "Dzina la malonda likufunika" (Chichewa)
  - "Base price must be a positive number"
  - "Stock quantity cannot be negative"

---

### ✅ Test 5: Download Correction CSV

**Get Corrections:**
```bash
curl -X GET "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/$BATCH_ID/corrections" \
  -H "Authorization: Bearer $TOKEN" \
  -o corrections.xlsx
```

**Expected File:**
Excel file with:
- All invalid rows
- Original data preserved
- `Error_Reason` column (English)
- `Error_Reason_NY` column (Chichewa)
- `Row_Number` column

---

### ✅ Test 6: Cancel Staging Batch

**Cancel:**
```bash
curl -X DELETE "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/$BATCH_ID/cancel" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
- Staging rows deleted
- bulk_uploads status: CANCELLED

---

### ✅ Test 7: Get Products Needing Images

**Query:**
```bash
curl -X GET "http://localhost:3000/api/shops/$SHOP_ID/products/needs-images?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
- List of shop_products with listing_status = NEEDS_IMAGES
- From previous commits

---

### ✅ Test 8: Upload Missing Specs Test

**Upload:**
```bash
curl -X POST "http://localhost:3000/api/shops/$SHOP_ID/products/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-missing-specs.xlsx"
```

**Expected:**
- Products valid but flagged as NEEDS_SPECS
- Missing specs listed in `missing_specs` JSONB column

**Preview will show:**
```json
{
  "targetListingStatus": "NEEDS_SPECS",
  "missingSpecs": ["RAM", "Storage"]
}
```

---

### ✅ Test 9: Update Product Specs

**Update Specs:**
```bash
SHOP_PRODUCT_ID="uuid-from-commit"

curl -X PATCH "http://localhost:3000/api/shops/$SHOP_ID/products/$SHOP_PRODUCT_ID/specs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "specs": {
      "RAM": "8GB",
      "Storage": "256GB"
    }
  }'
```

**Expected:**
- Specs updated in variant_values JSONB
- If all required specs now complete, status may change to NEEDS_IMAGES

---

### ✅ Test 10: Add Product Images

**Upload Image:**
```bash
curl -X POST "http://localhost:3000/api/shops/$SHOP_ID/products/$SHOP_PRODUCT_ID/images" \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@test-image.jpg"
```

**Expected:**
- Image uploaded to Cloudinary
- Added to product images array
- If specs complete, status changes to LIVE

---

### ✅ Test 11: Get Upload History

**Query:**
```bash
curl -X GET "http://localhost:3000/api/shops/$SHOP_ID/products/bulk/history?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "uploads": [
      {
        "id": "uuid",
        "batchId": "BULK-...",
        "fileName": "test-valid-electronics.xlsx",
        "status": "COMPLETED",
        "totalRows": 3,
        "successfulRows": 3,
        "failedRows": 0,
        "createdAt": "2026-02-03T..."
      }
    ],
    "pagination": {...}
  }
}
```

---

### ✅ Test 12: Governance - Pending Batch Limit

**Test:**
Upload 4 files without committing any

**Expected:**
4th upload should fail with:
```json
{
  "success": false,
  "message": "Maximum 3 pending batches allowed. Please commit or cancel existing batches.",
  "errors": 429
}
```

---

### ✅ Test 13: Product Matching (Fuzzy Match)

**Test:**
1. Upload "iPhone 15 Pro Max" successfully
2. Upload same product again with slightly different name: "IPhone 15 Pro Max 256GB"

**Expected:**
- Second upload should match existing parent product
- `matchedProductId` should be set
- `willCreateProduct` = false
- Still creates new shop_product (different shop listing)

---

## 📊 Validation Rules

### Required Fields
- Product Name ✅
- Base Price (MWK) ✅
- Stock Quantity ✅

### Optional Fields
- Category
- Brand
- SKU (auto-generated if empty)
- Condition (default: NEW)
- Description

### Tech Spec Requirements (Electronics Categories)
- **Smartphones**: RAM, Storage, Screen Size
- **Laptops**: Processor, RAM, Storage
- **Audio**: Type, Connectivity
- (See `techSpecValidator.service.ts` for full list)

### Validation Rules
- Price must be > 0
- Stock must be >= 0
- Condition must be valid enum
- Category must exist (if provided)
- Tech specs must be valid for category

---

## 🐛 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid token | Token expired | Login again to get fresh token |
| File too large | > 200 rows | Split into multiple files |
| Pending batch limit | 3+ pending batches | Commit or cancel existing batches |
| Category not found | Invalid category name | Use exact category name from system |
| Invalid price | Not a number | Must be numeric value |
| Missing required field | Empty required column | Fill in Product Name, Price, Stock |

---

## 📝 Notes

- **Access Token**: Expires in 1 hour (restart server for new settings)
- **Batch IDs**: Format `BULK-{timestamp}-{random}`
- **Price Markup**: Display price = Base price × 1.0526 (5.26% platform fee)
- **SKU Generation**: `{ShopCode}-{BrandCode}-{ProductCode}` if empty
- **Email Notifications**: Sent on commit (summary of upload)
- **Bilingual Errors**: All validation errors in English + Chichewa

---

## ✅ Success Checklist

- [ ] Can download template
- [ ] Can upload valid products
- [ ] Can preview staging batch
- [ ] Can commit to production
- [ ] Can preview invalid rows
- [ ] Can download correction CSV
- [ ] Can cancel staging batch
- [ ] Products show correct listing_status
- [ ] Can update specs for NEEDS_SPECS products
- [ ] Can add images for NEEDS_IMAGES products
- [ ] Products become LIVE when complete
- [ ] Upload history shows correctly
- [ ] Governance limits work
- [ ] Product matching works
- [ ] Error messages in English + Chichewa

---

## 🎬 Ready to Test!

All test files are generated in the root directory:
- `test-valid-electronics.xlsx`
- `test-mixed-quality.xlsx`
- `test-missing-specs.xlsx`
- `test-general-products.xlsx`
- `test-comprehensive.xlsx`

**Current Access Token:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjUwZTliMTg3LTU4NTEtNDZiYy04NGU5LWFiODkwNDhjMDJjZCIsImVtYWlsIjoiY2hpZnVuZG9iaXppd2Vja0BnbWFpbC5jb20iLCJyb2xlIjoiU0VMTEVSIiwiZmlyc3RfbmFtZSI6IkNoaWZ1bmRvIiwibGFzdF9uYW1lIjoiQml6aXdlY2siLCJpYXQiOjE3NzAxMDA1OTgsImV4cCI6MTc3MDEwNDE5OH0.f8FeQx_EYtXf4S_A8l5u9oWKj1l_NQVBrqiWVMGvt_k
```

**Shop ID:**
```
400e1a66-2540-40a5-a1e0-0e55f0d341f6
```

Let's start testing! 🚀
