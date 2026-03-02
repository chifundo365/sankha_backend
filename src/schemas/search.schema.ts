import { z } from "zod";

/**
 * Zod schema for the unified product search endpoint.
 *
 * Security notes:
 * - `q` is trimmed, length-capped, and stripped of characters that could
 *   interfere with SQL `LIKE` / `similarity()` operators.
 * - `specs` is validated as a flat string→string JSON object; keys and values
 *   are length-capped to prevent oversized payloads reaching the query.
 * - `category_id` must be a valid UUID to prevent injection.
 * - Numeric params (lat, lng, prices) are regex-gated then transformed.
 */

const sanitizeSearchString = (val: string): string =>
  val.replace(/[%_\\]/g, "").trim();

const numericString = (fieldName: string) =>
  z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || /^-?\d+(\.\d+)?$/.test(val),
      `${fieldName} must be a valid number`
    )
    .transform((val) => (val === undefined ? undefined : parseFloat(val)));

const positiveIntString = (fieldName: string, max: number) =>
  z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || /^\d+$/.test(val),
      `${fieldName} must be a positive integer`
    )
    .transform((val) => (val === undefined ? undefined : Number(val)))
    .refine(
      (val) => val === undefined || (val > 0 && val <= max),
      `${fieldName} must be between 1 and ${max}`
    );

const specsSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (val === undefined || val.trim() === "") return undefined;
    return val;
  })
  .refine(
    (val) => {
      if (val === undefined) return true;
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === "object" && !Array.isArray(parsed) && parsed !== null;
      } catch {
        return false;
      }
    },
    "specs must be a valid JSON object"
  )
  .transform((val) => {
    if (val === undefined) return undefined;
    const parsed = JSON.parse(val) as Record<string, unknown>;
    // Sanitise: only allow string keys ≤ 50 chars, string values ≤ 100 chars
    const sanitised: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k).slice(0, 50);
      const value = String(v).slice(0, 100);
      if (key.length > 0) {
        sanitised[key] = value;
      }
    }
    return Object.keys(sanitised).length > 0 ? sanitised : undefined;
  });

export const searchQuerySchema = z.object({
  query: z.object({
    q: z
      .string({ message: "Search query is required" })
      .min(2, "Search query must be at least 2 characters")
      .max(100, "Search query must not exceed 100 characters")
      .transform(sanitizeSearchString)
      .refine((val) => val.length >= 2, "Search query must be at least 2 characters after sanitisation"),

    brand: z
      .string()
      .max(100, "Brand must not exceed 100 characters")
      .transform(sanitizeSearchString)
      .optional(),

    model: z
      .string()
      .max(100, "Model must not exceed 100 characters")
      .transform(sanitizeSearchString)
      .optional(),

    category_id: z
      .string()
      .uuid("category_id must be a valid UUID")
      .optional(),

    condition: z
      .enum(["NEW", "REFURBISHED", "USED_LIKE_NEW", "USED_GOOD", "USED_FAIR"])
      .optional(),

    min_price: numericString("min_price").refine(
      (val) => val === undefined || val >= 0,
      "min_price must be non-negative"
    ),

    max_price: numericString("max_price").refine(
      (val) => val === undefined || val >= 0,
      "max_price must be non-negative"
    ),

    lat: numericString("lat").refine(
      (val) => val === undefined || (val >= -90 && val <= 90),
      "lat must be between -90 and 90"
    ),

    lng: numericString("lng").refine(
      (val) => val === undefined || (val >= -180 && val <= 180),
      "lng must be between -180 and 180"
    ),

    radius_km: z
      .string()
      .optional()
      .default(process.env.DEFAULT_SEARCH_RADIUS_KM || "15")
      .refine(
        (val) => /^\d+(\.\d+)?$/.test(val),
        "radius_km must be a valid positive number"
      )
      .transform((val) => parseFloat(val))
      .refine(
        (val) => val > 0 && val <= 500,
        "radius_km must be between 0 and 500"
      ),

    specs: specsSchema,

    page: positiveIntString("page", 1000).transform((val) => val ?? 1),

    limit: positiveIntString("limit", 50).transform((val) => val ?? 20),
  }),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>["query"];
