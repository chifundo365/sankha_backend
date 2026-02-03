import { Router } from "express";
import { shopProductController } from "../controllers/shop-product.controller";
import { bulkUploadController } from "../controllers/bulkUpload.controller";
import validateResource from "../middleware/validateResource";
import {
  addShopProductSchema,
  updateShopProductSchema,
  removeShopProductSchema,
  getShopProductsSchema,
  getShopProductSchema
} from "../schemas/shop-product.schema";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import { uploadMultiple, uploadSingle, uploadExcel } from "../middleware/upload.middleware";
import { 
  canBulkUpload, 
  verifyBatchOwnership, 
  checkPendingBatchLimit 
} from "../middleware/bulkUploadGovernance.middleware";

// mergeParams: true allows access to :shopId from parent router
const router = Router({ mergeParams: true });

/**
 * Public routes - No authentication required
 */

// Get all products for a shop
// Route: GET /api/shops/:shopId/products
router.get(
  "/",
  validateResource(getShopProductsSchema),
  shopProductController.getShopProducts
);

/**
 * Bulk Upload routes - Seller, Admin, Super Admin
 * NOTE: These routes must come BEFORE /:shopProductId to avoid parameter conflict
 * v4.0: Now includes governance middleware for permission checks
 */

// Download bulk upload template
// Route: GET /api/shops/:shopId/products/bulk/template
router.get(
  "/bulk/template",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.downloadTemplate
);

// Upload products via Excel
// Route: POST /api/shops/:shopId/products/bulk
// v4.0: Now checks can_bulk_upload permission and pending batch limit
router.post(
  "/bulk",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  canBulkUpload,           // v4.0: Check shop has bulk upload permission
  checkPendingBatchLimit,  // v4.0: Check pending batch limit
  uploadExcel,
  bulkUploadController.bulkUpload
);

// Get bulk upload history
// Route: GET /api/shops/:shopId/products/bulk/history
router.get(
  "/bulk/history",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.getUploadHistory
);

// Get specific upload details
// Route: GET /api/shops/:shopId/products/bulk/:uploadId
router.get(
  "/bulk/:uploadId",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.getUploadDetails
);

/**
 * v4.0 Staging Pipeline Routes
 * All batch-specific routes verify ownership
 */

// Get staging preview before commit
// Route: GET /api/shops/:shopId/products/bulk/:batchId/preview
router.get(
  "/bulk/:batchId/preview",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  verifyBatchOwnership,    // v4.0: Verify user owns this batch
  bulkUploadController.getStagingPreview
);

// Commit staging batch to production
// Route: POST /api/shops/:shopId/products/bulk/:batchId/commit
router.post(
  "/bulk/:batchId/commit",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  verifyBatchOwnership,    // v4.0: Verify user owns this batch
  bulkUploadController.commitStagingBatch
);

// Cancel staging batch
// Route: DELETE /api/shops/:shopId/products/bulk/:batchId/cancel
router.delete(
  "/bulk/:batchId/cancel",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  verifyBatchOwnership,    // v4.0: Verify user owns this batch
  bulkUploadController.cancelStagingBatch
);

// Download correction file for invalid rows
// Route: GET /api/shops/:shopId/products/bulk/:batchId/corrections
router.get(
  "/bulk/:batchId/corrections",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  verifyBatchOwnership,    // v4.0: Verify user owns this batch
  bulkUploadController.downloadCorrections
);

// Get preview of correction errors
// Route: GET /api/shops/:shopId/products/bulk/:batchId/corrections/preview
router.get(
  "/bulk/:batchId/corrections/preview",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  verifyBatchOwnership,    // v4.0: Verify user owns this batch
  bulkUploadController.getCorrectionPreview
);

// Get products needing images
// Route: GET /api/shops/:shopId/products/needs-images
router.get(
  "/needs-images",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.getProductsNeedingImages
);

// Get products needing specs (v4.0)
// Route: GET /api/shops/:shopId/products/needs-specs
router.get(
  "/needs-specs",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.getProductsNeedingSpecs
);

/**
 * Protected routes - Seller (shop owner), Admin, Super Admin
 */

// Add product to shop inventory
// Route: POST /api/shops/:shopId/products
router.post(
  "/",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(addShopProductSchema),
  shopProductController.addProductToShop
);

// Update shop product
// Route: PUT /api/shops/:shopId/products/:shopProductId
router.put(
  "/:shopProductId",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(updateShopProductSchema),
  shopProductController.updateShopProduct
);

// Remove product from shop (soft delete)
// Route: DELETE /api/shops/:shopId/products/:shopProductId
router.delete(
  "/:shopProductId",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(removeShopProductSchema),
  shopProductController.removeProductFromShop
);

// Quick stock update
// Route: PATCH /api/shops/:shopId/products/:shopProductId/stock
router.patch(
  "/:shopProductId/stock",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopProductController.updateStock
);

// Update product specs (v4.0 - for completing NEEDS_SPECS products)
// Route: PATCH /api/shops/:shopId/products/:shopProductId/specs
router.patch(
  "/:shopProductId/specs",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.updateProductSpecs
);

// Get stock change logs
// Route: GET /api/shops/:shopId/products/:shopProductId/stock-logs
router.get(
  "/:shopProductId/stock-logs",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopProductController.getStockLogs
);

// Upload shop product images
// Route: POST /api/shops/:shopId/products/:shopProductId/images
router.post(
  "/:shopProductId/images",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  uploadMultiple,
  shopProductController.uploadShopProductImages
);

// Add single image to product (for completing bulk-uploaded products)
// Route: POST /api/shops/:shopId/products/:shopProductId/image
router.post(
  "/:shopProductId/image",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  uploadSingle,
  bulkUploadController.addProductImage
);

// Delete shop product image
// Route: DELETE /api/shops/:shopId/products/:shopProductId/images/:imageIndex
router.delete(
  "/:shopProductId/images/:imageIndex",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopProductController.deleteShopProductImage
);

/**
 * Public parameterized routes - MUST be last to avoid conflicts with specific routes
 */

// Get single shop product
// Route: GET /api/shops/:shopId/products/:shopProductId
router.get(
  "/:shopProductId",
  validateResource(getShopProductSchema),
  shopProductController.getShopProduct
);

export default router;
