import { z } from "zod";

/**
 * Schema for creating a new address
 */
export const createAddressSchema = z.object({
  body: z.object({
    contact_name: z
      .string({ message: "Contact name is required" })
      .min(2, "Contact name must be at least 2 characters")
      .max(255, "Contact name must not exceed 255 characters"),

    phone_number: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
      .optional(),

    address_line1: z
      .string({ message: "Address is required" })
      .min(5, "Address must be at least 5 characters")
      .max(255, "Address must not exceed 255 characters"),

    city: z
      .string({ message: "City is required" })
      .min(2, "City must be at least 2 characters")
      .max(100, "City must not exceed 100 characters"),

    country: z
      .string()
      .max(100, "Country must not exceed 100 characters")
      .default("Malawi")
      .optional(),

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

    is_default: z.boolean().default(false).optional()
  })
});

/**
 * Schema for updating an address
 */
export const updateAddressSchema = z.object({
  params: z.object({
    addressId: z.string().uuid("Address ID must be a valid UUID")
  }),
  body: z
    .object({
      contact_name: z
        .string()
        .min(2, "Contact name must be at least 2 characters")
        .max(255, "Contact name must not exceed 255 characters")
        .optional(),

      phone_number: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
        .optional(),

      address_line1: z
        .string()
        .min(5, "Address must be at least 5 characters")
        .max(255, "Address must not exceed 255 characters")
        .optional(),

      city: z
        .string()
        .min(2, "City must be at least 2 characters")
        .max(100, "City must not exceed 100 characters")
        .optional(),

      country: z
        .string()
        .max(100, "Country must not exceed 100 characters")
        .optional(),

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

      is_default: z.boolean().optional()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for getting a single address
 */
export const getAddressSchema = z.object({
  params: z.object({
    addressId: z.string().uuid("Address ID must be a valid UUID")
  })
});

/**
 * Schema for deleting an address
 */
export const deleteAddressSchema = z.object({
  params: z.object({
    addressId: z.string().uuid("Address ID must be a valid UUID")
  })
});

/**
 * Schema for setting default address
 */
export const setDefaultAddressSchema = z.object({
  params: z.object({
    addressId: z.string().uuid("Address ID must be a valid UUID")
  })
});
