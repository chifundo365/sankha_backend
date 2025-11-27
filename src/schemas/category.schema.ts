import { z } from "zod";

/**
 * Schema for creating a new category
 */
export const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Category name is required" })
      .min(2, "Category name must be at least 2 characters")
      .max(100, "Category name must not exceed 100 characters"),

    description: z
      .string()
      .max(500, "Description must not exceed 500 characters")
      .optional()
  })
});

/**
 * Schema for updating a category
 */
export const updateCategorySchema = z.object({
  params: z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID")
  }),
  body: z
    .object({
      name: z
        .string()
        .min(2, "Category name must be at least 2 characters")
        .max(100, "Category name must not exceed 100 characters")
        .optional(),

      description: z
        .string()
        .max(500, "Description must not exceed 500 characters")
        .optional()
        .nullable()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for getting a single category
 */
export const getCategorySchema = z.object({
  params: z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID")
  }),
  query: z.object({
    include_counts: z
      .string()
      .optional()
      .transform(val => val === "true")
      .default("false"),

    include_stats: z
      .string()
      .optional()
      .transform(val => val === "true")
      .default("false")
  })
});

/**
 * Schema for deleting a category
 */
export const deleteCategorySchema = z.object({
  params: z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID")
  })
});

/**
 * Schema for listing categories with filters
 */
export const listCategoriesSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .transform(val => parseInt(val, 10))
      .refine(val => val > 0, "Page must be greater than 0"),

    limit: z
      .string()
      .optional()
      .default("20")
      .transform(val => parseInt(val, 10))
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100"),

    search: z.string().optional(),

    include_counts: z
      .string()
      .optional()
      .transform(val => val === "true")
      .default("false"),

    sort: z
      .enum([
        "name_asc",
        "name_desc",
        "created_asc",
        "created_desc",
        "products_asc",
        "products_desc"
      ])
      .optional()
      .default("name_asc")
  })
});

/**
 * Schema for getting products by category
 */
export const getCategoryProductsSchema = z.object({
  params: z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID")
  }),
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .transform(val => parseInt(val, 10))
      .refine(val => val > 0, "Page must be greater than 0"),

    limit: z
      .string()
      .optional()
      .default("20")
      .transform(val => parseInt(val, 10))
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100"),

    min_price: z
      .string()
      .optional()
      .transform(val => (val ? parseFloat(val) : undefined)),

    max_price: z
      .string()
      .optional()
      .transform(val => (val ? parseFloat(val) : undefined)),

    condition: z.enum(["NEW", "USED", "REFURBISHED"]).optional(),

    search: z.string().optional(),

    sort: z
      .enum([
        "price_asc",
        "price_desc",
        "name_asc",
        "name_desc",
        "created_asc",
        "created_desc"
      ])
      .optional()
      .default("created_desc")
  })
});
