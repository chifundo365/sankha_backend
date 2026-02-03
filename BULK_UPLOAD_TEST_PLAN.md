# Bulk Upload v4.0 - Complete Testing Plan

## Test Environment
- **User**: Chifundo Biziweck (chifundobiziweck@gmail.com)
- **Shop**: Chifundo Tech Store
- **Shop ID**: `400e1a66-2540-40a5-a1e0-0e55f0d341f6`
- **Access Token**: Saved for all subsequent calls
- **Server**: http://localhost:3000

---

## System Architecture Understanding

### v4.0 Flow
```
Upload Excel → Staging → Validation → Preview → (Commit OR Cancel OR Download Corrections)
```

### Key Features
1. **Staging Pipeline**: Products staged before going live
2. **Smart Matching**: Fuzzy match existing products
3. **Tech Spec Validation**: Category-aware required specs
4. **Correction CSV**: Download invalid rows with errors
5. **Partial Commit**: Can commit only valid rows
6. **Status Progression**: BROKEN → NEEDS_SPECS → NEEDS_IMAGES → LIVE
7. **Governance**: Shop-level bulk upload permissions
8. **Bilingual Errors**: English + Chichewa

---

## Test Scenarios

### ✅ Scenario 1: Download Template
**Purpose**: Get the Excel template sellers use to upload products

**API Endpoint**:
```
GET /api/shops/:shopId/products/bulk/template
```

**Expected**: Download `sankha-bulk-upload-template.xlsx`

---

### ✅ Scenario 2: Upload Valid Products (All Perfect Data)
**Purpose**: Test successful upload with complete product information

**Test Data**:
- iPhone 15 Pro Max 256GB (Smartphones)
- Samsung Galaxy S24 Ultra (Smartphones)
- Hisense 55" Smart TV (TV & Audio)

**Expected Results**:
- Status: `STAGING`
- All rows: `VALID`
- Returns `batchId` for preview

---

### ✅ Scenario 3: Upload Mixed Data (Valid + Invalid)
**Purpose**: Test validation engine with mixed quality data

**Test Data**:
- 3 valid products
- 1 product with invalid price (string instead of number)
- 1 product with missing product name
- 1 product with malformed JSON specs

**Expected Results**:
- Valid rows: 3
- Invalid rows: 3
- Error messages in English + Chichewa

---

### ✅ Scenario 4: Preview Staging Batch
**Purpose**: View staged products before committing

**API Endpoint**:
```
GET /api/shops/:shopId/products/bulk/:batchId/preview?page=1&showInvalid=false
```

**Expected**:
- Paginated list of valid products
- Product matching status (new vs existing)
- Tech spec validation results
- Target listing status (NEEDS_IMAGES, NEEDS_SPECS, LIVE)

---

### ✅ Scenario 5: Preview Invalid Rows
**Purpose**: View products that failed validation

**API Endpoint**:
```
GET /api/shops/:shopId/products/bulk/:batchId/preview?showInvalid=true
```

**Expected**:
- List of invalid rows
- Error reasons (bilingual)
- Original data preserved

---

### ✅ Scenario 6: Download Correction CSV
**Purpose**: Get Excel file with invalid rows for seller to fix

**API Endpoint**:
```
GET /api/shops/:shopId/products/bulk/:batchId/corrections
```

**Expected**:
- Excel file: `corrections-{batchId}.xlsx`
- Original data + `Error_Reason` column
- `Error_Reason_NY` (Chichewa) column
- `Row_Number` column

---

### ✅ Scenario 7: Commit Valid Products
**Purpose**: Move valid products from staging to production

**API Endpoint**:
```
POST /api/shops/:shopId/products/bulk/:batchId/commit
Body: { "skipInvalid": true }
```

**Expected**:
- Valid products created in `shop_products` table
- Listing status set appropriately:
  - `NEEDS_IMAGES` if no images
  - `NEEDS_SPECS` if missing required specs
  - `LIVE` if complete
- Parent products created/matched
- Email notification sent to seller

---

### ✅ Scenario 8: Cancel Staging Batch
**Purpose**: Discard staging batch without committing

**API Endpoint**:
```
DELETE /api/shops/:shopId/products/bulk/:batchId/cancel
```

**Expected**:
- Staging rows deleted
- Bulk upload status: `CANCELLED`

---

### ✅ Scenario 9: Get Upload History
**Purpose**: View past bulk uploads

**API Endpoint**:
```
GET /api/shops/:shopId/products/bulk/history?page=1&limit=10
```

**Expected**:
- List of uploads with status
- Counts: total, successful, failed

---

### ✅ Scenario 10: Get Products Needing Images
**Purpose**: Dashboard view of products uploaded without images

**API Endpoint**:
```
GET /api/shops/:shopId/products/needs-images
```

**Expected**:
- Products with `listing_status = NEEDS_IMAGES`
- Can upload images via separate endpoint

---

### ✅ Scenario 11: Get Products Needing Specs
**Purpose**: Dashboard view of products with incomplete specs

**API Endpoint**:
```
GET /api/shops/:shopId/products/needs-specs
```

**Expected**:
- Products with `listing_status = NEEDS_SPECS`
- Missing spec fields listed

---

### ✅ Scenario 12: Update Product Specs
**Purpose**: Complete missing specs for a product

**API Endpoint**:
```
PATCH /api/shops/:shopId/products/:shopProductId/specs
Body: { "specs": { "RAM": "8GB", "Storage": "256GB" } }
```

**Expected**:
- Specs updated
- Listing status changes if all specs complete

---

### ✅ Scenario 13: Add Product Images
**Purpose**: Add images to products in NEEDS_IMAGES status

**API Endpoint**:
```
POST /api/shops/:shopId/products/:shopProductId/images
Body: multipart/form-data with image file
```

**Expected**:
- Image uploaded to Cloudinary
- Added to product images array
- Listing status changes to LIVE (if specs complete)

---

### ✅ Scenario 14: Bulk Upload Governance
**Purpose**: Test shop permission checks

**Expected**:
- Only shops with `can_bulk_upload = true` can upload
- Max 3 pending batches per shop
- Admin can override

---

### ✅ Scenario 15: Tech Spec Validation
**Purpose**: Test category-specific spec requirements

**Test Data**:
- Smartphone without RAM spec (should flag as NEEDS_SPECS)
- Laptop without Storage spec (should flag as NEEDS_SPECS)
- Generic accessory (no spec requirements)

**Expected**:
- Electronics categories enforce tech specs
- General categories don't require specs
- Missing specs tracked in `missing_specs` JSONB

---

## Test Data Files

### File 1: `test-valid-products.xlsx`
- 5 products with complete data
- All should pass validation
- Mix of categories

### File 2: `test-mixed-quality.xlsx`
- 10 products: 6 valid, 4 invalid
- Various error types
- Tests error messaging

### File 3: `test-electronics-specs.xlsx`
- 5 electronics products
- Mix of complete/incomplete specs
- Tests tech validation

### File 4: `test-duplicates.xlsx`
- 3 products that already exist in shop
- Tests duplicate detection

---

## Success Criteria

✅ **Upload Success**: 
- File parses correctly
- Batch ID returned
- Status: STAGING

✅ **Validation Success**:
- Valid/Invalid counts correct
- Error messages clear (EN + Chichewa)
- Tech specs validated per category

✅ **Preview Success**:
- Pagination works
- Valid/Invalid filter works
- Product matching shown

✅ **Commit Success**:
- Products created with correct status
- Parent products matched/created
- Email sent

✅ **Correction Success**:
- Excel file downloads
- All invalid rows included
- Error columns present

---

## Testing Order

1. Download template
2. Upload valid products → Preview → Commit
3. Upload mixed data → Preview → Download corrections → Cancel
4. Upload electronics → Check spec validation → Preview
5. Upload duplicates → Check duplicate detection
6. Test governance (pending batch limit)
7. Get products needing images/specs
8. Update specs/images
9. View upload history

---

## Notes

- **Access Token**: Must be included in all requests
- **Shop ID**: `400e1a66-2540-40a5-a1e0-0e55f0d341f6`
- **Batch IDs**: Saved from upload responses
- **Error Handling**: All endpoints should return proper error responses
- **Bilingual**: All user-facing errors in EN + NY (Chichewa)
