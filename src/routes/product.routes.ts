import { Router } from "express";
import { productController } from "../controllers/product.controller";
import validateResource from "../middleware/validateResource";
import { uploadMultiple } from "../middleware/upload.middleware";
import {
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  deleteProductSchema,
  listProductsSchema,
  getProductsByCategorySchema,
  uploadProductImagesSchema,
  deleteProductImageSchema
} from "../schemas/product.schema";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";

const router = Router();

/**
 * Public routes - No authentication required
 */

// Get all products with filtering, search, and pagination
router.get(
  "/",
  validateResource(listProductsSchema),
  productController.getAllProducts
);

// (search endpoint moved to top-level router at /api/search)

// Get products by category
router.get(
  "/category/:categoryId",
  validateResource(getProductsByCategorySchema),
  productController.getProductsByCategory
);

/**
 * Product Matching routes - Authenticated users (sellers)
 * These must come BEFORE /:id route to avoid conflicts
 */

// Search for matching products (seller looking to create listing)
router.get(
  "/match",
  protect,
  productController.findMatchingProducts
);

// Request a new product (pending approval)
router.post(
  "/request",
  protect,
  productController.requestNewProduct
);

// Get pending products for admin review
router.get(
  "/pending",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.getPendingProducts
);

// Get single product by ID (must come after /match, /request, /pending)
router.get(
  "/:id",
  validateResource(getProductSchema),
  productController.getProductById
);

/**
 * Admin product approval routes
 */

// Approve a pending product
router.post(
  "/:id/approve",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.approveProduct
);

// Reject a pending product
router.post(
  "/:id/reject",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.rejectProduct
);

// Merge duplicate product into canonical
router.post(
  "/:id/merge",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.mergeProducts
);

// Find potential duplicates for a product
router.get(
  "/:id/duplicates",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.findDuplicates
);

/**
 * Protected routes - Admin only
 */

// Create new product
router.post(
  "/",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(createProductSchema),
  productController.createProduct
);

// Update product
router.put(
  "/:id",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(updateProductSchema),
  productController.updateProduct
);

// Delete product (soft delete)
router.delete(
  "/:id",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(deleteProductSchema),
  productController.deleteProduct
);

// Upload product images
router.post(
  "/:productId/images",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(uploadProductImagesSchema),
  uploadMultiple,
  productController.uploadProductImages
);

// Delete product image
router.delete(
  "/:productId/images/:imageIndex",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(deleteProductImageSchema),
  productController.deleteProductImage
);

export default router;
