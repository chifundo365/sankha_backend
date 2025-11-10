import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" })
      .email("Invalid email address"),
    password: z.string({ message: "Password is required" })
      .min(1, "Password cannot be empty")
  })
});

export const registerSchema = z.object({
  body: z.object({
    full_name: z.string({ message: "Full name is required" })
      .min(2, "Full name must be at least 2 characters")
      .max(150, "Full name must not exceed 150 characters"),
    email: z.string({ message: "Email is required" })
      .email("Invalid email address"),
    phone_number: z.string().optional(),
    password: z.string({ message: "Password is required" })
      .min(6, "Password must be at least 6 characters"),
    role: z.enum(["USER", "SELLER", "ADMIN", "SUPER_ADMIN"]).optional().default("USER")
  })
});

export type LoginInput = z.infer<typeof loginSchema>["body"];
export type RegisterInput = z.infer<typeof registerSchema>["body"];
    