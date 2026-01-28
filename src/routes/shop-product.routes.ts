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
router.post(
  "/bulk",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
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

// Get products needing images
// Route: GET /api/shops/:shopId/products/needs-images
router.get(
  "/needs-images",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  bulkUploadController.getProductsNeedingImages
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
