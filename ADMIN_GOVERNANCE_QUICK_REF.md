# Admin Bulk Upload Governance - Quick Reference

## ✅ Implemented APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/shops/:shopId/bulk-upload-permission` | PATCH | Toggle bulk upload permission |
| `/api/admin/bulk-uploads/pending` | GET | View all pending uploads |
| `/api/admin/bulk-uploads/stats` | GET | Platform statistics |
| `/api/admin/bulk-uploads/:batchId/force-commit` | POST | Force commit batch |
| `/api/admin/bulk-uploads/:batchId/force-cancel` | DELETE | Force cancel batch |

---

## 🔑 Quick Commands

### Toggle Shop Permission

**Disable:**
```bash
curl -X PATCH "http://localhost:3000/api/admin/shops/SHOP_ID/bulk-upload-permission" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"can_bulk_upload": false, "reason": "Policy violation"}'
```

**Enable:**
```bash
curl -X PATCH "http://localhost:3000/api/admin/shops/SHOP_ID/bulk-upload-permission" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"can_bulk_upload": true, "reason": "Verification complete"}'
```

### View Pending Uploads

```bash
curl "http://localhost:3000/api/admin/bulk-uploads/pending?page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Get Statistics

```bash
# Last 30 days
curl "http://localhost:3000/api/admin/bulk-uploads/stats?days=30" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Last 7 days
curl "http://localhost:3000/api/admin/bulk-uploads/stats?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Force Commit Batch

```bash
curl -X POST "http://localhost:3000/api/admin/bulk-uploads/BATCH_ID/force-commit" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Emergency publish"}'
```

### Force Cancel Batch

```bash
curl -X DELETE "http://localhost:3000/api/admin/bulk-uploads/BATCH_ID/force-cancel" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Policy violation"}'
```

---

## 📁 Files Modified

### Backend Files
- ✅ `src/schemas/admin.schema.ts` - Added 5 new validation schemas
- ✅ `src/controllers/admin.controller.ts` - Added 5 new controller functions
- ✅ `src/routes/admin.routes.ts` - Added 5 new routes

### Documentation
- ✅ `docs/ADMIN_BULK_UPLOAD_GOVERNANCE.md` - Complete API documentation
- ✅ `test-admin-bulk-governance.sh` - Test script

### Database Tables Used
- `shops` - Toggle `can_bulk_upload` flag
- `bulk_uploads` - Query pending uploads, statistics
- `bulk_upload_staging` - Cancel batch (delete staging rows)
- `users` - Get shop owner info

---

## 🎯 Use Cases

### 1. Disable Problematic Shop
```bash
# View shop's pending uploads
curl "http://localhost:3000/api/admin/bulk-uploads/pending?shop_id=SHOP_ID"

# Disable bulk upload
curl -X PATCH ".../shops/SHOP_ID/bulk-upload-permission" \
  -d '{"can_bulk_upload": false, "reason": "Multiple invalid uploads"}'
```

### 2. Monitor Platform Health
```bash
# Get stats
curl ".../bulk-uploads/stats?days=7"

# Check pending uploads
curl ".../bulk-uploads/pending?limit=50"
```

### 3. Emergency Intervention
```bash
# Force cancel bad batch
curl -X DELETE ".../bulk-uploads/BATCH_ID/force-cancel" \
  -d '{"reason": "Contains prohibited items"}'

# Or force commit stuck batch
curl -X POST ".../bulk-uploads/BATCH_ID/force-commit" \
  -d '{"reason": "Seller unavailable"}'
```

---

## 🔒 Security Features

- ✅ Admin/Super Admin only access
- ✅ JWT authentication required
- ✅ All actions logged to console with admin email
- ✅ Reason field for audit trail
- ✅ Input validation via Zod schemas

---

## 🧪 Testing

Run the test script:
```bash
bash test-admin-bulk-governance.sh
```

Tests covered:
- ✅ Admin authentication
- ✅ Get statistics
- ✅ Get pending uploads
- ✅ Toggle bulk upload permission
- ✅ Verify permission enforcement

---

## 📊 Response Examples

### Statistics Response
```json
{
  "overview": {
    "totalUploads": 245,
    "completedUploads": 220,
    "stagingUploads": 15,
    "successRate": "89.80%"
  },
  "products": {
    "totalCreated": 15680,
    "validationRate": "96.89%"
  },
  "topShops": [...]
}
```

### Pending Uploads Response
```json
{
  "batches": [{
    "batchId": "BULK-1706886400000-abc123",
    "shopName": "Chifundo's Electronics",
    "totalRows": 150,
    "validRows": 140,
    "invalidRows": 10,
    "status": "STAGING"
  }],
  "pagination": {...}
}
```

---

## 🚀 Next Steps

**Production Deployment:**
1. Add database audit log table for admin actions
2. Implement email notifications to sellers when permission changed
3. Add admin dashboard UI
4. Set up monitoring alerts for:
   - High invalid row rates
   - Suspicious upload patterns
   - Pending uploads exceeding threshold

**Enhancements:**
- Bulk permission toggle (multiple shops at once)
- Scheduled reports
- Advanced filtering (by date range, status, shop tier)
- Export statistics to CSV/Excel
