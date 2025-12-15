import { Router } from "express";
import { shopProductController } from "../controllers/shop-product.controller";
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
import { uploadMultiple } from "../middleware/upload.middleware";

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

// Get single shop product
// Route: GET /api/shops/:shopId/products/:shopProductId
router.get(
  "/:shopProductId",
  validateResource(getShopProductSchema),
  shopProductController.getShopProduct
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

// Delete shop product image
// Route: DELETE /api/shops/:shopId/products/:shopProductId/images/:imageIndex
router.delete(
  "/:shopProductId/images/:imageIndex",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopProductController.deleteShopProductImage
);

export default router;
