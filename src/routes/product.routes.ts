import { Router } from "express";
import { productController } from "../controllers/product.controller";
import validateResource from "../middleware/validateResource";
import { uploadMultiple } from "../middleware/upload.middleware";
import {
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  deleteProductSchema,
  listProductsSchema
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

// Get products by category
router.get("/category/:categoryId", productController.getProductsByCategory);

// Get single product by ID
router.get(
  "/:id",
  validateResource(getProductSchema),
  productController.getProductById
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
  uploadMultiple,
  productController.uploadProductImages
);

// Delete product image
router.delete(
  "/:productId/images/:imageIndex",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  productController.deleteProductImage
);

export default router;
