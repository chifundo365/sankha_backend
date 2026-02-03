# Bulk Upload v4.0 - Production Readiness Implementation

> Implementation summary for Lead Backend Architect review

---

## ✅ Components Implemented

### 1. Governance Middleware (`bulkUploadGovernance.middleware.ts`)

**Location**: [src/middleware/bulkUploadGovernance.middleware.ts](src/middleware/bulkUploadGovernance.middleware.ts)

**Features**:
- ✅ Checks `shops.can_bulk_upload` boolean flag
- ✅ Returns bilingual 403 error (English + Chichewa): 
  - "Your shop is not authorized for bulk uploads. / Sitolo yanu ilibe chilolezo choika katundu wambiri nthawi imodzi."
- ✅ Verifies `shopId` in request matches authenticated user's shop
- ✅ Admin bypass for batch operations
- ✅ Pending batch limit enforcement (max 3)

**Exported Middleware**:
```typescript
canBulkUpload          // Check shop has permission
verifyBatchOwnership   // Verify batch belongs to user's shop
adminBulkUploadAccess  // Admin-only access
checkPendingBatchLimit // Enforce max pending batches
```

**Route Integration**:
```typescript
// In shop-product.routes.ts
router.post("/bulk", 
  protect, 
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  canBulkUpload,           // v4.0
  checkPendingBatchLimit,  // v4.0
  uploadExcel,
  bulkUploadController.bulkUpload
);
```

---

### 2. Database & Enum Alignment

**Status**: ✅ Already aligned in schema.prisma

**Verified Enums**:
```prisma
enum listing_status {
  NEEDS_IMAGES      // Bulk uploaded, waiting for images
  NEEDS_SPECS       // Missing required tech specs
  PENDING_REVIEW    // Has images, awaiting approval
  LIVE              // Approved and visible
  REJECTED          
  PAUSED            
  BROKEN            // Invalid data
}
```

**`commitBatch` Logic**:
- Products with specs but no images → `NEEDS_IMAGES`
- Products missing required specs → `NEEDS_SPECS`
- Invalid data → `BROKEN`

---

### 3. CLI Tools (`/scripts`)

#### A. `sankha-process-batch.ts` (Existing - Enhanced)

**Location**: [scripts/sankha-process-batch.ts](scripts/sankha-process-batch.ts)

**Usage**:
```bash
npx ts-node scripts/sankha-process-batch.ts <batch_id> [options]

Options:
  --dry-run     Preview what would be committed
  --verbose     Show detailed output
  --shop-id     Override shop ID (admin only)
```

#### B. `sankha-generate-correction.ts` (New)

**Location**: [scripts/sankha-generate-correction.ts](scripts/sankha-generate-correction.ts)

**Usage**:
```bash
npx ts-node scripts/sankha-generate-correction.ts <batch_id> [options]

Options:
  --output, -o    Output file path (default: ./corrections-<batch_id>.xlsx)
  --format, -f    Output format: xlsx or csv (default: xlsx)
  --verbose, -v   Show detailed output
  --include-raw   Include raw data columns
```

**Output Format**:
- Sheet 1: "Corrections" - All invalid rows with ERRORS column
- Sheet 2: "Error Summary" - Aggregated error counts by type
- Sheet 3: "Instructions" - How to fix and re-upload

---

### 4. Automated Cleanup (Cron Job)

**Location**: [src/jobs/bulkUploadCleanup.job.ts](src/jobs/bulkUploadCleanup.job.ts)

**Configuration**:
```env
STAGING_RETENTION_HOURS=24        # Delete staging rows after 24h
ABANDONED_BATCH_HOURS=48          # Cancel abandoned batches after 48h
COMPLETED_BATCH_RETENTION_DAYS=30 # Delete old batch records after 30d
CLEANUP_CRON_SCHEDULE=0 0 * * *   # Run at midnight daily
ENABLE_SCHEDULED_CLEANUP=true     # Enable/disable scheduler
TZ=Africa/Blantyre                # Malawi timezone
```

**Service Methods**:
```typescript
bulkUploadCleanupService.getCleanupStats()      // Get current stats
bulkUploadCleanupService.cleanupOldStagingRows() // Delete stale rows
bulkUploadCleanupService.cancelAbandonedBatches() // Cancel old STAGING
bulkUploadCleanupService.runFullCleanup()        // Run all cleanup tasks
bulkUploadCleanupService.cleanupBatch(batchId)   // Manually cleanup batch
```

**Installation**:
```bash
npm install node-cron
npm install -D @types/node-cron
```

**Server Integration** (add to server.ts):
```typescript
import { startCleanupScheduler } from './jobs/bulkUploadCleanup.job';

// After app.listen()
startCleanupScheduler();
```

---

### 5. Fuzzy Matching Refinement

**Location**: [src/services/productMatching.service.ts](src/services/productMatching.service.ts)

**New Method**: `findMatchingProductAdvanced()`

**Pipeline**:
```
Step 1: Exact match on normalized_name
   └─ If verified exact match found → return immediately

Step 2: Fuzzy match with pg_trgm (0.8 threshold)
   └─ Falls back to local trigram similarity if pg_trgm unavailable
   └─ Boosts verified products by 15%

Step 3: Brand + Category match
   └─ Matches products with same brand AND category
   └─ Applies brand (+5%) and category (+5%) boosts

Step 4: Keyword/Alias match
   └─ Searches products.keywords[] and products.aliases[]
```

**Scoring Formula**:
```
finalScore = similarity 
  + (isVerified ? 0.15 : 0)
  + (matchType === 'exact' ? 0.10 : 0)
  + (brandMatches ? 0.05 : 0)
  + (categoryMatches ? 0.05 : 0)
```

**Usage**:
```typescript
import { productMatchingService } from './services/productMatching.service';

const result = await productMatchingService.findMatchingProductAdvanced({
  productName: 'iPhone 15 Pro 256GB',
  brand: 'Apple',
  categoryName: 'Smartphones'
});

console.log(result.matched);      // true
console.log(result.product);      // Best match
console.log(result.matchType);    // 'exact' | 'fuzzy' | 'brand_model' | 'keyword'
console.log(result.confidence);   // 95.5
console.log(result.explanation);  // "Matched via fuzzy (verified) with 95.5% confidence"
```

**pg_trgm Setup** (Optional but recommended):
```sql
-- Run in PostgreSQL to enable trigram similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index for faster fuzzy searches
CREATE INDEX idx_products_normalized_name_trgm 
ON products USING GIN (normalized_name gin_trgm_ops);
```

---

## 📋 Route Updates

The following routes now use governance middleware:

| Route | New Middleware |
|-------|----------------|
| `POST /bulk` | `canBulkUpload`, `checkPendingBatchLimit` |
| `GET /bulk/:batchId/preview` | `verifyBatchOwnership` |
| `POST /bulk/:batchId/commit` | `verifyBatchOwnership` |
| `DELETE /bulk/:batchId/cancel` | `verifyBatchOwnership` |
| `GET /bulk/:batchId/corrections` | `verifyBatchOwnership` |
| `GET /bulk/:batchId/corrections/preview` | `verifyBatchOwnership` |

---

## 🔧 Deployment Checklist

- [ ] Run Prisma migration for schema updates
- [ ] Install node-cron: `npm install node-cron @types/node-cron`
- [ ] Enable pg_trgm extension in PostgreSQL
- [ ] Add cleanup scheduler to server.ts
- [ ] Set environment variables for cleanup config
- [ ] Test governance middleware with shops where `can_bulk_upload = false`
- [ ] Test batch ownership verification
- [ ] Test correction file generation CLI
- [ ] Monitor cleanup job logs

---

## 📊 Monitoring

**Cleanup Stats Endpoint** (can be added to admin routes):
```typescript
router.get('/bulk-upload/cleanup-stats', async (req, res) => {
  const stats = await bulkUploadCleanupService.getCleanupStats();
  res.json({ success: true, data: stats });
});
```

**Manual Cleanup Trigger**:
```typescript
router.post('/bulk-upload/cleanup', async (req, res) => {
  const result = await bulkUploadCleanupService.runFullCleanup();
  res.json({ success: true, data: result });
});
```

---

*Implementation completed: February 2026*
