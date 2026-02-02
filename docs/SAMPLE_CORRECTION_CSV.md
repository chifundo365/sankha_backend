# Sample Correction CSV Output

## Scenario
A seller uploaded an Electronics bulk upload with 10 products. 2 rows failed validation:
- Row 3: Missing Base Price + Missing RAM specification for an iPhone
- Row 7: Invalid SKU (duplicate)

## Generated Correction File

### Sheet 1: Instructions

```
CORRECTION FILE - Fix and Re-upload

This file contains rows that failed validation.

HOW TO FIX:
1. Review the "Error_Reason" column for each row
2. Fix the highlighted issues in the data columns
3. Do NOT change the "Row_Reference" column
4. Save and re-upload this file

SUMMARY:
Total rows to fix: 2

ERROR BREAKDOWN:
- MISSING_PRICE: 1 rows
- MISSING_TECH_SPECS: 1 rows
- DUPLICATE_SKU: 1 rows

CHILANKHULO CHA CHICHEWA:
Onetsetsani kolamu ya "Error_Reason_Chichewa" kuti mumvetse vuto.
```

### Sheet 2: Corrections Data

| Row_Reference | Product Name | Category | Brand | SKU | Base Price (MWK) | Stock Quantity | Condition | Description | Spec: Storage | Spec: RAM | Spec: Screen Size | Spec: Color | Spec: Processor | Error_Reason | Error_Reason_Chichewa |
|---------------|-------------|----------|-------|-----|------------------|----------------|-----------|-------------|---------------|-----------|-------------------|-------------|-----------------|--------------|----------------------|
| 3 | iPhone 15 Pro Max 256GB | Smartphones | Apple | IP15-001 | | 5 | NEW | Brand new sealed | 256GB | | 6.7" | Black Titanium | A17 Pro | Base price is required; Missing required specs for tech item. Missing specs: RAM | Mtengo woyambira ndi wofunikira; Chonde lembani mndandanda wa katunduyu. Kulibe: RAM |
| 7 | Samsung Galaxy S24 Ultra | Smartphones | Samsung | SGS24-DUP | 1350000 | 3 | NEW | Factory unlocked | 512GB | 12GB | 6.8" | Titanium Gray | Snapdragon 8 Gen 3 | This SKU already exists in your shop | SKU imeneyi ilipo kale m'sitolo yanu |

## JSON Response (Preview API)

```json
{
  "rows": [
    {
      "Row_Reference": 3,
      "Product Name": "iPhone 15 Pro Max 256GB",
      "Category": "Smartphones",
      "Brand": "Apple",
      "SKU": "IP15-001",
      "Base Price (MWK)": "",
      "Stock Quantity": 5,
      "Condition": "NEW",
      "Description": "Brand new sealed",
      "Spec: Storage": "256GB",
      "Spec: RAM": "",
      "Spec: Screen Size": "6.7\"",
      "Spec: Color": "Black Titanium",
      "Spec: Processor": "A17 Pro",
      "Error_Reason": "Base price is required; Missing required specs for tech item. Missing specs: RAM",
      "Error_Reason_Chichewa": "Mtengo woyambira ndi wofunikira; Chonde lembani mndandanda wa katunduyu. Kulibe: RAM"
    },
    {
      "Row_Reference": 7,
      "Product Name": "Samsung Galaxy S24 Ultra",
      "Category": "Smartphones",
      "Brand": "Samsung",
      "SKU": "SGS24-DUP",
      "Base Price (MWK)": 1350000,
      "Stock Quantity": 3,
      "Condition": "NEW",
      "Description": "Factory unlocked",
      "Spec: Storage": "512GB",
      "Spec: RAM": "12GB",
      "Spec: Screen Size": "6.8\"",
      "Spec: Color": "Titanium Gray",
      "Spec: Processor": "Snapdragon 8 Gen 3",
      "Error_Reason": "This SKU already exists in your shop",
      "Error_Reason_Chichewa": "SKU imeneyi ilipo kale m'sitolo yanu"
    }
  ],
  "summary": {
    "batchId": "shop123-1706745600000-abc123",
    "totalInvalid": 2,
    "errorBreakdown": {
      "MISSING_PRICE": 1,
      "MISSING_TECH_SPECS": 1,
      "DUPLICATE_SKU": 1
    },
    "generatedAt": "2026-02-01T10:30:00.000Z"
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 2,
    "hasNext": false,
    "hasPrev": false
  }
}
```

## How to Fix the Errors

### Row 3: iPhone 15 Pro Max 256GB

**Problems:**
1. ❌ Missing `Base Price (MWK)` - Must provide a positive number
2. ❌ Missing `Spec: RAM` - Required for Smartphones category

**Fix:**
- Enter price: `1500000`
- Enter RAM: `8GB`

### Row 7: Samsung Galaxy S24 Ultra

**Problem:**
1. ❌ SKU `SGS24-DUP` already exists in the shop

**Fix:**
- Change SKU to unique value: `SGS24-002` or leave blank for auto-generation

## Re-upload Process

1. Download correction file: `GET /api/seller/uploads/{batchId}/corrections`
2. Open in Excel/Google Sheets
3. Fix errors in highlighted rows
4. Save file
5. Re-upload: `POST /api/shops/{shopId}/bulk-upload/resubmit`
   - Include `original_batch_id` to link to original upload
   - Only corrected rows will be processed

## API Endpoints

```bash
# Download correction file
GET /api/seller/uploads/{batchId}/corrections?format=xlsx&chichewa=true

# Preview corrections before download
GET /api/seller/uploads/{batchId}/corrections/preview?page=1&limit=20

# Commit valid rows (skip invalid)
POST /api/shops/{shopId}/bulk-upload/{batchId}/commit
Body: { "skipInvalid": true }

# Get dashboard pending actions
GET /api/seller/inventory/pending-actions?lang=ny
```
