import { z } from "zod";

/**
 * Schema for adding a product to shop inventory
 */
export const addShopProductSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  }),
  body: z.object({
    product_id: z
      .string({ message: "Product ID is required" })
      .uuid("Product ID must be a valid UUID"),

    sku: z.string().max(50, "SKU must not exceed 50 characters").optional(),

    base_price: z
      .number({ message: "Base price is required" })
      .positive("Base price must be greater than 0")
      .max(99999999.99, "Base price is too large"),

    stock_quantity: z
      .number({ message: "Stock quantity is required" })
      .int("Stock quantity must be an integer")
      .min(0, "Stock quantity cannot be negative"),

    condition: z
      .enum(["NEW", "REFURBISHED", "USED_LIKE_NEW", "USED_GOOD", "USED_FAIR"])
      .default("NEW"),

    shop_description: z
      .string()
      .max(2000, "Shop description must not exceed 2000 characters")
      .optional(),

    specs: z.record(z.string(), z.any()).optional(),

    images: z
      .array(z.string().url("Each image must be a valid URL"))
      .max(10, "Maximum 10 images allowed")
      .default([]),

  })
});

/**
 * Schema for updating a shop product
 */
export const updateShopProductSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID"),
    shopProductId: z.string().uuid("Shop Product ID must be a valid UUID")
  }),
  body: z
    .object({
      sku: z
        .string()
        .max(50, "SKU must not exceed 50 characters")
        .optional()
        .nullable(),

      base_price: z
        .number()
        .positive("Base price must be greater than 0")
        .max(99999999.99, "Base price is too large")
        .optional(),

      stock_quantity: z
        .number()
        .int("Stock quantity must be an integer")
        .min(0, "Stock quantity cannot be negative")
        .optional(),

      condition: z
        .enum(["NEW", "REFURBISHED", "USED_LIKE_NEW", "USED_GOOD", "USED_FAIR"])
        .optional(),

      shop_description: z
        .string()
        .max(2000, "Shop description must not exceed 2000 characters")
        .optional()
        .nullable(),

      specs: z.record(z.string(), z.any()).optional().nullable(),

      images: z
        .array(z.string().url("Each image must be a valid URL"))
        .max(10, "Maximum 10 images allowed")
        .optional(),

    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for removing a product from shop
 */
export const removeShopProductSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID"),
    shopProductId: z.string().uuid("Shop Product ID must be a valid UUID")
  })
});

/**
 * Schema for getting shop products
 */
export const getShopProductsSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  }),
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .refine(val => /^\d+$/.test(val), "Page must be a positive number")
      .transform(Number),

    limit: z
      .string()
      .optional()
      .default("10")
      .refine(val => /^\d+$/.test(val), "Limit must be a positive number")
      .transform(Number)
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100"),

    is_available: z
      .enum(["true", "false"])
      .transform(val => val === "true")
      .optional(),

    condition: z
      .enum(["NEW", "REFURBISHED", "USED_LIKE_NEW", "USED_GOOD", "USED_FAIR"])
      .optional(),

    min_stock: z
      .string()
      .regex(/^\d+$/, "Min stock must be a number")
      .transform(Number)
      .optional(),

    search: z.string().max(255).optional()
  })
});

/**
 * Schema for getting a single shop product
 */
export const getShopProductSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID"),
    shopProductId: z.string().uuid("Shop Product ID must be a valid UUID")
  })
});

// Export TypeScript types
export type AddShopProductInput = z.infer<typeof addShopProductSchema>["body"];
export type UpdateShopProductInput = z.infer<
  typeof updateShopProductSchema
>["body"];
export type GetShopProductsQuery = z.infer<
  typeof getShopProductsSchema
>["query"];
