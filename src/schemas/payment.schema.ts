import { z } from "zod";

/**
 * Schema for initiating a payment
 */
export const initiatePaymentSchema = z.object({
  body: z.object({
    first_name: z
      .string({ message: "First name is required" })
      .min(1, "First name cannot be empty")
      .max(100, "First name must not exceed 100 characters"),
    last_name: z
      .string({ message: "Last name is required" })
      .min(1, "Last name cannot be empty")
      .max(100, "Last name must not exceed 100 characters"),
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email format"),
    phone: z
      .string({ message: "Phone number is required" })
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters"),
    amount: z
      .number({ message: "Amount is required" })
      .positive("Amount must be a positive number")
      .or(
        z.string().transform((val, ctx) => {
          const parsed = parseFloat(val);
          if (isNaN(parsed) || parsed <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Amount must be a positive number",
            });
            return z.NEVER;
          }
          return parsed;
        })
      ),
    currency: z
      .string()
      .length(3, "Currency must be a 3-letter code")
      .default("MWK")
      .optional(),
    orderId: z
      .string()
      .uuid("Invalid order ID format")
      .optional(),
    metadata: z
      .record(z.string(), z.any())
      .optional(),
  }),
});

/**
 * Schema for verifying a payment
 */
export const verifyPaymentSchema = z.object({
  body: z.object({
    tx_ref: z
      .string({ message: "Transaction reference is required" })
      .min(1, "Transaction reference cannot be empty")
      .max(255, "Transaction reference must not exceed 255 characters"),
  }),
});

/**
 * Schema for submitting a payment report
 */
export const paymentReportSchema = z.object({
  body: z.object({
    tx_ref: z
      .string({ message: "Transaction reference is required" })
      .min(1, "Transaction reference cannot be empty"),
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email format"),
    status: z
      .string({ message: "Status is required" })
      .min(1, "Status cannot be empty"),
    message: z
      .string({ message: "Message is required" })
      .min(1, "Message cannot be empty")
      .max(1000, "Message must not exceed 1000 characters"),
  }),
});

/**
 * Schema for getting a payment by tx_ref
 */
export const getPaymentSchema = z.object({
  params: z.object({
    txRef: z
      .string({ message: "Transaction reference is required" })
      .min(1, "Transaction reference cannot be empty"),
  }),
});

/**
 * Schema for getting payments by order ID
 */
export const getOrderPaymentsSchema = z.object({
  params: z.object({
    orderId: z
      .string({ message: "Order ID is required" })
      .uuid("Invalid order ID format"),
  }),
});

/**
 * Schema for getting user's own payment history with pagination
 */
export const getMyPaymentsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default("1")
      .refine((val) => /^\d+$/.test(val), "Page must be a positive number")
      .transform(Number)
      .refine((val) => val > 0, "Page must be greater than 0"),
    limit: z
      .string()
      .optional()
      .default("10")
      .refine((val) => /^\d+$/.test(val), "Limit must be a positive number")
      .transform(Number)
      .refine((val) => val > 0 && val <= 100, "Limit must be between 1 and 100"),
    status: z
      .enum(["pending", "success", "failed", "cancelled"])
      .optional(),
  }),
});

// Type exports
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>["body"];
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>["body"];
export type PaymentReportInput = z.infer<typeof paymentReportSchema>["body"];
export type GetMyPaymentsQuery = z.infer<typeof getMyPaymentsSchema>["query"];
