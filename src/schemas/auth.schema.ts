import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    password: z
      .string({ message: "Password is required" })
      .min(1, "Password cannot be empty")
  })
});

export const registerSchema = z.object({
  body: z.object({
    first_name: z
      .string({ message: "First name is required" })
      .min(2, "First name must be at least 2 characters")
      .max(75, "First name must not exceed 75 characters"),
    last_name: z
      .string({ message: "Last name is required" })
      .min(2, "Last name must be at least 2 characters")
      .max(75, "Last name must not exceed 75 characters"),
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    phone_number: z
      .string({ message: "Phone number is required" })
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters"),
    password: z
      .string({ message: "Password is required" })
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password must not exceed 100 characters"),
    role: z.enum(["USER", "SELLER", "ADMIN", "SUPER_ADMIN"]).optional()
  })
});

export type LoginInput = z.infer<typeof loginSchema>["body"];
export type RegisterInput = z.infer<typeof registerSchema>["body"];
