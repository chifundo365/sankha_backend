import { z } from "zod";

/**
 * Schema for getting user profile (own)
 */
export const getProfileSchema = z.object({});

/**
 * Schema for updating user profile
 */
export const updateProfileSchema = z.object({
  body: z
    .object({
      first_name: z
        .string()
        .min(2, "First name must be at least 2 characters")
        .max(75, "First name must not exceed 75 characters")
        .optional(),

      last_name: z
        .string()
        .min(2, "Last name must be at least 2 characters")
        .max(75, "Last name must not exceed 75 characters")
        .optional(),

      phone_number: z
        .string()
        .min(10, "Phone number must be at least 10 characters")
        .max(20, "Phone number must not exceed 20 characters")
        .optional()
        .nullable(),

      profile_image: z
        .string()
        .url("Profile image must be a valid URL")
        .optional()
        .nullable()
    })
    .refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});

/**
 * Schema for changing password
 */
export const changePasswordSchema = z.object({
  body: z.object({
    current_password: z
      .string({ message: "Current password is required" })
      .min(1, "Current password is required"),

    new_password: z
      .string({ message: "New password is required" })
      .min(8, "New password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      )
  })
});

/**
 * Schema for getting public user profile
 */
export const getPublicProfileSchema = z.object({
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID")
  })
});

/**
 * Schema for listing users (admin)
 */
export const listUsersSchema = z.object({
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

    role: z.enum(["USER", "SELLER", "ADMIN", "SUPER_ADMIN"]).optional(),

    is_active: z.string().optional().transform(val => val === "true"),

    search: z.string().optional()
  })
});

/**
 * Schema for getting user details (admin)
 */
export const getUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID")
  })
});

/**
 * Schema for updating user role (admin)
 */
export const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID")
  }),
  body: z.object({
    role: z.enum(["USER", "SELLER", "ADMIN", "SUPER_ADMIN"], {
      message: "Role must be USER, SELLER, ADMIN, or SUPER_ADMIN"
    })
  })
});

/**
 * Schema for updating user status (admin)
 */
export const updateUserStatusSchema = z.object({
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID")
  }),
  body: z.object({
    is_active: z.boolean({ message: "is_active must be a boolean" })
  })
});

/**
 * Schema for deleting user (admin)
 */
export const deleteUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID")
  })
});
