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

export default router;
