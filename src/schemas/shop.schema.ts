import { z } from "zod";

/**
 * Schema for creating a new shop
 */
export const createShopSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Shop name is required" })
      .min(2, "Shop name must be at least 2 characters")
      .max(255, "Shop name must not exceed 255 characters"),

    description: z
      .string()
      .max(1000, "Description must not exceed 1000 characters")
      .optional(),

    business_registration_no: z
      .string()
      .max(100, "Business registration number must not exceed 100 characters")
      .optional(),

    address_line1: z
      .string()
      .max(255, "Address must not exceed 255 characters")
      .optional(),

    city: z.string().max(100, "City must not exceed 100 characters").optional(),

    latitude: z
      .number()
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90")
      .optional(),

    longitude: z
      .number()
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180")
      .optional(),

    phone: z
      .string()
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters")
      .optional(),

    email: z
      .string()
      .email("Invalid email address")
      .max(255, "Email must not exceed 255 characters")
      .optional(),

    delivery_enabled: z.boolean().default(true)
  })
});

/**
 * Schema for updating a shop
 */
export const updateShopSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  }),
  body: z
    .object({
      name: z
        .string()
        .min(2, "Shop name must be at least 2 characters")
        .max(255, "Shop name must not exceed 255 characters")
        .optional(),

      description: z
        .string()
        .max(1000, "Description must not exceed 1000 characters")
        .optional()
        .nullable(),

      business_registration_no: z
        .string()
        .max(100, "Business registration number must not exceed 100 characters")
        .optional()
        .nullable(),

      address_line1: z
        .string()
        .max(255, "Address must not exceed 255 characters")
        .optional()
        .nullable(),

      city: z
        .string()
        .max(100, "City must not exceed 100 characters")
        .optional()
        .nullable(),

      latitude: z
        .number()
        .min(-90, "Latitude must be between -90 and 90")
        .max(90, "Latitude must be between -90 and 90")
        .optional()
        .nullable(),

      longitude: z
        .number()
        .min(-180, "Longitude must be between -180 and 180")
        .max(180, "Longitude must be between -180 and 180")
        .optional()
        .nullable(),

      phone: z
        .string()
        .min(10, "Phone number must be at least 10 characters")
        .max(20, "Phone number must not exceed 20 characters")
        .optional()
        .nullable(),

      email: z
        .string()
        .email("Invalid email address")
        .max(255, "Email must not exceed 255 characters")
        .optional()
        .nullable(),

      delivery_enabled: z.boolean().optional()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for getting a single shop
 */
export const getShopSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  })
});

/**
 * Schema for deleting a shop
 */
export const deleteShopSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  })
});

/**
 * Schema for listing shops with filters
 */
export const listShopsSchema = z.object({
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
      .default("10")
      .transform(val => parseInt(val, 10))
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100"),

    city: z.string().optional(),

    is_verified: z.string().optional().transform(val => val === "true"),

    delivery_enabled: z.string().optional().transform(val => val === "true"),

    search: z.string().optional(),

    owner_id: z.string().uuid("Owner ID must be a valid UUID").optional()
  })
});

/**
 * Schema for verifying a shop (ADMIN only)
 */
export const verifyShopSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Shop ID must be a valid UUID")
  }),
  body: z.object({
    is_verified: z.boolean({ message: "is_verified must be a boolean" })
  })
});
