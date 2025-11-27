import { Router } from "express";
import { categoryController } from "../controllers/category.controller";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import validateResource from "../middleware/validateResource";
import {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  deleteCategorySchema,
  listCategoriesSchema,
  getCategoryProductsSchema
} from "../schemas/category.schema";

const router = Router();

/**
 * Public routes - accessible to all users
 */

// Get all categories
router.get(
  "/",
  validateResource(listCategoriesSchema),
  categoryController.getAllCategories
);

// Get single category
router.get(
  "/:categoryId",
  validateResource(getCategorySchema),
  categoryController.getCategoryById
);

// Get products in a category
router.get(
  "/:categoryId/products",
  validateResource(getCategoryProductsSchema),
  categoryController.getCategoryProducts
);

/**
 * Protected routes - Admin and Super Admin only
 */

// Create new category
router.post(
  "/",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(createCategorySchema),
  categoryController.createCategory
);

// Update category
router.put(
  "/:categoryId",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(updateCategorySchema),
  categoryController.updateCategory
);

// Delete category
router.delete(
  "/:categoryId",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  validateResource(deleteCategorySchema),
  categoryController.deleteCategory
);

export default router;
