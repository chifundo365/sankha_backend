# Admin Bulk Upload Governance APIs

Complete documentation for admin-only bulk upload governance endpoints.

---

## 📋 Overview

These APIs allow ADMIN and SUPER_ADMIN users to monitor, control, and manage the bulk upload system across the entire platform.

**Base URL:** `/api/admin`  
**Authentication:** Required (ADMIN or SUPER_ADMIN role)  
**Authorization Header:** `Bearer <access_token>`

---

## 1. Toggle Bulk Upload Permission

**Endpoint:** `PATCH /api/admin/shops/:shopId/bulk-upload-permission`  
**Role:** ADMIN, SUPER_ADMIN  
**Description:** Enable or disable bulk upload capability for a specific shop

### Request

**URL Parameters:**
- `shopId` (UUID, required) - Shop identifier

**Body:**
```json
{
  "can_bulk_upload": true,
  "reason": "Shop verification complete"
}
```

**Fields:**
- `can_bulk_upload` (boolean, required) - Enable (true) or disable (false)
- `reason` (string, optional, max 500 chars) - Reason for action (for audit logs)

### Response (200 OK)

```json
{
  "success": true,
  "message": "Bulk upload enabled for shop",
  "data": {
    "shop": {
      "id": "shop-uuid",
      "name": "Chifundo's Electronics",
      "can_bulk_upload": true,
      "owner": "Chifundo Banda"
    },
    "reason": "Shop verification complete"
  }
}
```

### Error Responses

**404 Not Found** - Shop doesn't exist
```json
{
  "success": false,
  "message": "Shop not found"
}
```

### Use Cases

1. **Disable for Policy Violation:**
```bash
curl -X PATCH "http://localhost:3000/api/admin/shops/abc-123/bulk-upload-permission" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "can_bulk_upload": false,
    "reason": "Multiple invalid product uploads - review required"
  }'
```

2. **Enable After Review:**
```bash
curl -X PATCH "http://localhost:3000/api/admin/shops/abc-123/bulk-upload-permission" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "can_bulk_upload": true,
    "reason": "Seller training completed"
  }'
```

---

## 2. Get All Pending Bulk Uploads

**Endpoint:** `GET /api/admin/bulk-uploads/pending`  
**Role:** ADMIN, SUPER_ADMIN  
**Description:** View all pending (STAGING) bulk uploads across the platform

### Request

**Query Parameters:**
- `page` (integer, optional, default: 1) - Page number
- `limit` (integer, optional, default: 20, max: 100) - Items per page
- `shop_id` (UUID, optional) - Filter by specific shop

### Response (200 OK)

```json
{
  "success": true,
  "message": "Pending bulk uploads retrieved",
  "data": {
    "batches": [
      {
        "id": "upload-uuid",
        "batchId": "BULK-1706886400000-abc123",
        "shopId": "shop-uuid",
        "shopName": "Chifundo's Electronics",
        "shopOwner": {
          "name": "Chifundo Banda",
          "email": "chifundo.banda@seller.com"
        },
        "totalRows": 150,
        "validRows": 140,
        "invalidRows": 10,
        "skippedRows": 0,
        "status": "STAGING",
        "createdAt": "2026-02-03T10:30:00Z",
        "updatedAt": "2026-02-03T10:30:15Z"
      }
    ],
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 20,
      "totalPages": 2
    }
  }
}
```

### Example Usage

**Get all pending uploads:**
```bash
curl "http://localhost:3000/api/admin/bulk-uploads/pending?page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Filter by shop:**
```bash
curl "http://localhost:3000/api/admin/bulk-uploads/pending?shop_id=abc-123" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 3. Get Bulk Upload Statistics

**Endpoint:** `GET /api/admin/bulk-uploads/stats`  
**Role:** ADMIN, SUPER_ADMIN  
**Description:** Get comprehensive statistics about bulk uploads

### Request

**Query Parameters:**
- `days` (integer, optional, default: 30, max: 365) - Number of days to include

### Response (200 OK)

```json
{
  "success": true,
  "message": "Bulk upload statistics retrieved",
  "data": {
    "period": {
      "days": 30,
      "since": "2026-01-04T00:00:00Z"
    },
    "overview": {
      "totalUploads": 245,
      "completedUploads": 220,
      "stagingUploads": 15,
      "cancelledUploads": 8,
      "failedUploads": 2,
      "successRate": "89.80%"
    },
    "products": {
      "totalCreated": 15680,
      "totalValidRows": 16200,
      "totalInvalidRows": 520,
      "validationRate": "96.89%"
    },
    "topShops": [
      {
        "shopId": "shop-uuid-1",
        "shopName": "TechHub Malawi",
        "uploadCount": 45
      },
      {
        "shopId": "shop-uuid-2",
        "shopName": "Chifundo's Electronics",
        "uploadCount": 38
      }
    ],
    "recentUploads": [
      {
        "batchId": "BULK-1706886400000-abc123",
        "shopName": "TechHub Malawi",
        "status": "COMPLETED",
        "totalRows": 150,
        "validRows": 145,
        "invalidRows": 5,
        "createdAt": "2026-02-03T09:15:00Z"
      }
    ]
  }
}
```

### Example Usage

**Last 30 days:**
```bash
curl "http://localhost:3000/api/admin/bulk-uploads/stats?days=30" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Last 7 days:**
```bash
curl "http://localhost:3000/api/admin/bulk-uploads/stats?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 4. Force Commit Batch

**Endpoint:** `POST /api/admin/bulk-uploads/:batchId/force-commit`  
**Role:** ADMIN, SUPER_ADMIN  
**Description:** Force commit a staging batch regardless of shop ownership

### Request

**URL Parameters:**
- `batchId` (string, required) - Batch identifier (e.g., "BULK-1706886400000-abc123")

**Body:**
```json
{
  "reason": "Seller requested emergency publish"
}
```

**Fields:**
- `reason` (string, optional, max 500 chars) - Reason for force commit

### Response (200 OK)

```json
{
  "success": true,
  "message": "Batch committed successfully by admin",
  "data": {
    "batchId": "BULK-1706886400000-abc123",
    "shopName": "Chifundo's Electronics",
    "productsCreated": 140,
    "reason": "Seller requested emergency publish"
  }
}
```

### Error Responses

**404 Not Found:**
```json
{
  "success": false,
  "message": "Batch not found"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Batch status is COMPLETED, cannot commit"
}
```

### Example Usage

```bash
curl -X POST "http://localhost:3000/api/admin/bulk-uploads/BULK-1706886400000-abc123/force-commit" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Admin override - seller unavailable"
  }'
```

### Use Cases

- Seller is unavailable but products need to go live
- Resolving stuck batches
- Emergency product launches

---

## 5. Force Cancel Batch

**Endpoint:** `DELETE /api/admin/bulk-uploads/:batchId/force-cancel`  
**Role:** ADMIN, SUPER_ADMIN  
**Description:** Force cancel a staging batch regardless of shop ownership

### Request

**URL Parameters:**
- `batchId` (string, required) - Batch identifier

**Body:**
```json
{
  "reason": "Contains prohibited products"
}
```

**Fields:**
- `reason` (string, optional, max 500 chars) - Reason for force cancel

### Response (200 OK)

```json
{
  "success": true,
  "message": "Batch cancelled successfully by admin",
  "data": {
    "batchId": "BULK-1706886400000-abc123",
    "shopName": "Chifundo's Electronics",
    "reason": "Contains prohibited products"
  }
}
```

### Error Responses

**404 Not Found:**
```json
{
  "success": false,
  "message": "Batch not found"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Batch is already COMPLETED"
}
```

### Example Usage

```bash
curl -X DELETE "http://localhost:3000/api/admin/bulk-uploads/BULK-1706886400000-abc123/force-cancel" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Policy violation - counterfeit products detected"
  }'
```

### Use Cases

- Removing prohibited/counterfeit products
- Policy enforcement
- Resolving technical issues

---

## 📊 Monitoring Dashboard Example

Here's a complete monitoring workflow:

```bash
#!/bin/bash
ADMIN_TOKEN="your-admin-token"
BASE_URL="http://localhost:3000/api/admin"

# 1. Check platform statistics
curl "$BASE_URL/bulk-uploads/stats?days=7"

# 2. View pending batches
curl "$BASE_URL/bulk-uploads/pending?limit=50"

# 3. Identify problematic shop
SHOP_ID="abc-123"

# 4. Review shop's pending uploads
curl "$BASE_URL/bulk-uploads/pending?shop_id=$SHOP_ID"

# 5. Decision: Disable bulk upload
curl -X PATCH "$BASE_URL/shops/$SHOP_ID/bulk-upload-permission" \
  -H "Content-Type: application/json" \
  -d '{"can_bulk_upload": false, "reason": "Multiple validation failures"}'

# 6. Cancel problematic batch
BATCH_ID="BULK-1706886400000-abc123"
curl -X DELETE "$BASE_URL/bulk-uploads/$BATCH_ID/force-cancel" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Invalid product data"}'
```

---

## 🔒 Security & Audit

All admin actions are logged to console with:
- Admin user email
- Timestamp
- Action taken (enable/disable/commit/cancel)
- Reason provided
- Affected shop/batch

**Example Log:**
```
[ADMIN ACTION] Bulk upload permission disabled for shop Chifundo's Electronics (shop-uuid)
{
  adminUser: 'peter.nyirenda@admin.com',
  reason: 'Multiple validation failures'
}
```

---

## 🎯 Governance Workflow

### Scenario: New Shop Onboarding

1. Shop created with `can_bulk_upload: false` (default)
2. Seller requests bulk upload access
3. Admin reviews seller:
   ```bash
   GET /api/shops/:shopId
   ```
4. Admin enables permission:
   ```bash
   PATCH /api/admin/shops/:shopId/bulk-upload-permission
   {"can_bulk_upload": true, "reason": "Verification complete"}
   ```

### Scenario: Policy Violation

1. Admin discovers problematic uploads:
   ```bash
   GET /api/admin/bulk-uploads/pending?shop_id=abc-123
   ```
2. Cancel bad batch:
   ```bash
   DELETE /api/admin/bulk-uploads/BATCH-ID/force-cancel
   {"reason": "Contains prohibited items"}
   ```
3. Disable shop's bulk upload:
   ```bash
   PATCH /api/admin/shops/abc-123/bulk-upload-permission
   {"can_bulk_upload": false, "reason": "Policy violation"}
   ```
4. Notify seller (manual or via notification system)

### Scenario: Platform Health Check

```bash
# Daily morning check
GET /api/admin/bulk-uploads/stats?days=1

# Weekly review
GET /api/admin/bulk-uploads/stats?days=7

# Monitor stuck batches
GET /api/admin/bulk-uploads/pending

# Top uploaders (check for abuse)
GET /api/admin/bulk-uploads/stats?days=30
# Review "topShops" array
```

---

## 📝 Notes

1. **Rate Limiting:** Admin endpoints use same rate limiter as other APIs
2. **Permissions:** Only ADMIN and SUPER_ADMIN roles can access these endpoints
3. **Audit Trail:** All actions logged to console (consider implementing database audit log)
4. **Batch Ownership:** Admins can access ANY batch, bypassing ownership checks
5. **Cascade Effects:** Disabling `can_bulk_upload` doesn't affect existing batches

---

## 🔗 Related APIs

- [Product Governance](/docs/PRODUCT_API_DOCUMENTATION.md) - Approve/reject products
- [Shop Management](/docs/SHOP_MANAGEMENT_API.md) - Shop verification
- [Bulk Upload System](/docs/BULK_UPLOAD_V4_IMPLEMENTATION.md) - Seller bulk upload docs
