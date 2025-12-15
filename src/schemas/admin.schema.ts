import { z } from "zod";

// IPv4 and IPv6 regex patterns
const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

const isValidIP = (ip: string) => {
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Schema for blocking an IP address
 */
export const blockIPSchema = z.object({
  body: z.object({
    ip: z
      .string({ message: "IP address is required" })
      .refine(isValidIP, "Invalid IP address format"),
    durationMinutes: z
      .number()
      .positive("Duration must be a positive number")
      .max(525600, "Duration cannot exceed 1 year (525600 minutes)")
      .optional(),
    reason: z
      .string()
      .max(500, "Reason must not exceed 500 characters")
      .optional()
  })
});

/**
 * Schema for unblocking an IP address (URL param)
 */
export const unblockIPSchema = z.object({
  params: z.object({
    ip: z
      .string({ message: "IP address is required" })
      .refine(isValidIP, "Invalid IP address format")
  })
});

/**
 * Schema for getting violations for a specific IP
 */
export const getIPViolationsSchema = z.object({
  params: z.object({
    ip: z
      .string({ message: "IP address is required" })
      .refine(isValidIP, "Invalid IP address format")
  })
});

/**
 * Schema for clearing violations for a specific IP
 */
export const clearIPViolationsSchema = z.object({
  params: z.object({
    ip: z
      .string({ message: "IP address is required" })
      .refine(isValidIP, "Invalid IP address format")
  })
});

/**
 * Schema for listing blocked IPs with optional pagination
 */
export const getBlockedIPsSchema = z.object({
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
      .default("50")
      .refine(val => /^\d+$/.test(val), "Limit must be a positive number")
      .transform(Number)
      .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
  })
});

/**
 * Schema for IP stats endpoint (no params required)
 */
export const getIPStatsSchema = z.object({});

// Export TypeScript types
export type BlockIPInput = z.infer<typeof blockIPSchema>["body"];
export type UnblockIPParams = z.infer<typeof unblockIPSchema>["params"];
export type GetIPViolationsParams = z.infer<typeof getIPViolationsSchema>["params"];
export type ClearIPViolationsParams = z.infer<typeof clearIPViolationsSchema>["params"];
export type GetBlockedIPsQuery = z.infer<typeof getBlockedIPsSchema>["query"];
