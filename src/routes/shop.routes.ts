import { Router } from "express";
import { shopController } from "../controllers/shop.controller";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import validateResource from "../middleware/validateResource";
import { uploadSingle, uploadGallery } from "../middleware/upload.middleware";
import {
  createShopSchema,
  updateShopSchema,
  getShopSchema,
  deleteShopSchema,
  listShopsSchema,
  verifyShopSchema
} from "../schemas/shop.schema";
import shopProductRoutes from "./shop-product.routes";

const router = Router();

// Nest shop product routes under /:shopId/products
router.use("/:shopId/products", shopProductRoutes);

/**
 * Public routes
 */

// GET /api/shops - Get all shops with filters (public)
router.get("/", validateResource(listShopsSchema), shopController.getAllShops);

/**
 * Protected routes
 */

// GET /api/shops/my-shops - Get current user's shops (must come before /:shopId)
router.get(
  "/my-shops",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopController.getMyShops
);

// GET /api/shops/:shopId - Get single shop (public)
router.get(
  "/:shopId",
  validateResource(getShopSchema),
  shopController.getShopById
);

// POST /api/shops - Create new shop
router.post(
  "/",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(createShopSchema),
  shopController.createShop
);

// PUT /api/shops/:shopId - Update shop
router.put(
  "/:shopId",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(updateShopSchema),
  shopController.updateShop
);

// DELETE /api/shops/:shopId - Delete shop
router.delete(
  "/:shopId",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  validateResource(deleteShopSchema),
  shopController.deleteShop
);

// PATCH /api/shops/:shopId/verify - Verify/unverify shop (ADMIN only)
router.patch(
  "/:shopId/verify",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(verifyShopSchema),
  shopController.verifyShop
);

// POST /api/shops/:shopId/logo - Upload shop logo
router.post(
  "/:shopId/logo",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  uploadSingle,
  shopController.uploadShopLogo
);

// POST /api/shops/:shopId/banner - Upload shop banner
router.post(
  "/:shopId/banner",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  uploadSingle,
  shopController.uploadShopBanner
);

// POST /api/shops/:shopId/gallery - Upload shop gallery images
router.post(
  "/:shopId/gallery",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  uploadGallery,
  shopController.uploadShopGallery
);

// DELETE /api/shops/:shopId/gallery/:imageIndex - Delete gallery image
router.delete(
  "/:shopId/gallery/:imageIndex",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  shopController.deleteShopGalleryImage
);

export default router;
