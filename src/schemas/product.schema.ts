import { z } from "zod";

/**
 * Schema for creating a new product
 */
export const createProductSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Product name is required" })
      .min(2, "Product name must be at least 2 characters")
      .max(255, "Product name must not exceed 255 characters"),

    brand: z
      .string()
      .max(100, "Brand name must not exceed 100 characters")
      .optional(),

    description: z
      .string()
      .max(5000, "Description must not exceed 5000 characters")
      .optional(),

    category_id: z
      .string({ message: "Category ID must be a valid UUID" })
      .uuid("Category ID must be a valid UUID")
      .optional(),

    base_price: z
      .number({ message: "Base price must be a number" })
      .positive("Base price must be greater than 0")
      .max(99999999.99, "Base price is too large")
      .optional(),

    images: z
      .array(z.string().url("Each image must be a valid URL"))
      .max(10, "Maximum 10 images allowed")
      .default([]),

    is_active: z.boolean().default(true)
  })
});

/**
 * Schema for updating an existing product
 */
export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Product ID must be a valid UUID")
  }),
  body: z
    .object({
      name: z
        .string()
        .min(2, "Product name must be at least 2 characters")
        .max(255, "Product name must not exceed 255 characters")
        .optional(),

      brand: z
        .string()
        .max(100, "Brand name must not exceed 100 characters")
        .optional()
        .nullable(),

      description: z
        .string()
        .max(5000, "Description must not exceed 5000 characters")
        .optional()
        .nullable(),

      category_id: z
        .string()
        .uuid("Category ID must be a valid UUID")
        .optional()
        .nullable(),

      base_price: z
        .number()
        .positive("Base price must be greater than 0")
        .max(99999999.99, "Base price is too large")
        .optional()
        .nullable(),

      images: z
        .array(z.string().url("Each image must be a valid URL"))
        .max(10, "Maximum 10 images allowed")
        .optional(),

      is_active: z.boolean().optional()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for getting a single product by ID
 */
export const getProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Product ID must be a valid UUID")
  })
});

/**
 * Schema for deleting a product
 */
export const deleteProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Product ID must be a valid UUID")
  })
});

/**
 * Schema for listing products with query parameters
 */
export const listProductsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .refine(val => /^\d+$/.test(val), "Page must be a positive number")
      .transform(Number)
      .refine(val => val > 0, "Page must be greater than 0"),

    limit: z
      .string()
      .optional()
      .default("10")
      .refine(val => /^\d+$/.test(val), "Limit must be a positive number")
      .transform(Number)
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100"),

    search: z.string().max(255, "Search term too long").optional(),

    category_id: z.string().uuid("Category ID must be a valid UUID").optional(),

    brand: z.string().max(100).optional(),

    is_active: z
      .enum(["true", "false"])
      .transform(val => val === "true")
      .optional(),

    min_price: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Min price must be a valid number")
      .transform(Number)
      .optional(),

    max_price: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Max price must be a valid number")
      .transform(Number)
      .optional(),

    sort_by: z
      .enum(["name", "base_price", "created_at", "updated_at"])
      .default("created_at"),

    sort_order: z.enum(["asc", "desc"]).default("desc")
  })
});

/**
 * Schema for getting products by category
 */
export const getProductsByCategorySchema = z.object({
  params: z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID")
  }),
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .refine(val => /^\d+$/.test(val), "Page must be a positive number")
      .transform(Number)
      .refine(val => val > 0, "Page must be greater than 0"),

    limit: z
      .string()
      .optional()
      .default("10")
      .refine(val => /^\d+$/.test(val), "Limit must be a positive number")
      .transform(Number)
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
  })
});

/**
 * Schema for uploading product images
 */
export const uploadProductImagesSchema = z.object({
  params: z.object({
    productId: z.string().uuid("Product ID must be a valid UUID")
  })
});

/**
 * Schema for deleting a product image
 */
export const deleteProductImageSchema = z.object({
  params: z.object({
    productId: z.string().uuid("Product ID must be a valid UUID"),
    imageIndex: z
      .string()
      .refine(val => /^\d+$/.test(val), "Image index must be a non-negative integer")
      .transform(Number)
      .refine(val => val >= 0, "Image index must be 0 or greater")
  })
});

// Export TypeScript types
export type CreateProductInput = z.infer<typeof createProductSchema>["body"];
export type UpdateProductInput = z.infer<typeof updateProductSchema>["body"];
export type GetProductParams = z.infer<typeof getProductSchema>["params"];
export type DeleteProductParams = z.infer<typeof deleteProductSchema>["params"];
export type ListProductsQuery = z.infer<typeof listProductsSchema>["query"];
export type GetProductsByCategoryParams = z.infer<typeof getProductsByCategorySchema>["params"];
export type UploadProductImagesParams = z.infer<typeof uploadProductImagesSchema>["params"];
export type DeleteProductImageParams = z.infer<typeof deleteProductImageSchema>["params"];
