import { z } from "zod";

/**
 * Schema for creating a review
 * Only allowed after order is DELIVERED
 * One review per shop_product per order
 */
export const createReviewSchema = z.object({
  body: z.object({
    order_id: z.string().uuid({
      message: "Valid order ID is required"
    }),
    shop_product_id: z.string().uuid({
      message: "Valid shop product ID is required"
    }),
    rating: z
      .number()
      .int()
      .min(1, {
        message: "Rating must be at least 1"
      })
      .max(5, {
        message: "Rating cannot exceed 5"
      }),
    comment: z
      .string()
      .min(10, {
        message: "Comment must be at least 10 characters"
      })
      .max(1000, {
        message: "Comment cannot exceed 1000 characters"
      })
      .optional()
  })
});

/**
 * Schema for getting a single review
 */
export const getReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().uuid({
      message: "Valid review ID is required"
    })
  })
});

/**
 * Schema for getting shop product reviews
 */
export const getShopProductReviewsSchema = z.object({
  params: z.object({
    shopProductId: z.string().uuid({
      message: "Valid shop product ID is required"
    })
  }),
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val) : 1)),
    limit: z.string().optional().transform(val => (val ? parseInt(val) : 10))
  })
});

/**
 * Schema for getting shop reviews (all products)
 */
export const getShopReviewsSchema = z.object({
  params: z.object({
    shopId: z.string().uuid({
      message: "Valid shop ID is required"
    })
  }),
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val) : 1)),
    limit: z.string().optional().transform(val => (val ? parseInt(val) : 10)),
    rating: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val) : undefined))
  })
});

/**
 * Schema for getting user's reviews
 */
export const getMyReviewsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val) : 1)),
    limit: z.string().optional().transform(val => (val ? parseInt(val) : 10))
  })
});

/**
 * Schema for updating a review
 * Only reviewer can update their own review
 */
export const updateReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().uuid({
      message: "Valid review ID is required"
    })
  }),
  body: z
    .object({
      rating: z
        .number()
        .int()
        .min(1, {
          message: "Rating must be at least 1"
        })
        .max(5, {
          message: "Rating cannot exceed 5"
        })
        .optional(),
      comment: z
        .string()
        .min(10, {
          message: "Comment must be at least 10 characters"
        })
        .max(1000, {
          message: "Comment cannot exceed 1000 characters"
        })
        .optional()
    })
    .refine(data => data.rating !== undefined || data.comment !== undefined, {
      message: "At least one field (rating or comment) must be provided"
    })
});

/**
 * Schema for deleting a review
 * Only reviewer or admin can delete
 */
export const deleteReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().uuid({
      message: "Valid review ID is required"
    })
  })
});

// Type exports for TypeScript
export type CreateReviewInput = z.infer<typeof createReviewSchema>["body"];
export type GetReviewInput = z.infer<typeof getReviewSchema>["params"];
export type GetShopProductReviewsInput = {
  params: z.infer<typeof getShopProductReviewsSchema>["params"];
  query: z.infer<typeof getShopProductReviewsSchema>["query"];
};
export type GetShopReviewsInput = {
  params: z.infer<typeof getShopReviewsSchema>["params"];
  query: z.infer<typeof getShopReviewsSchema>["query"];
};
export type GetMyReviewsInput = z.infer<typeof getMyReviewsSchema>["query"];
export type UpdateReviewInput = {
  params: z.infer<typeof updateReviewSchema>["params"];
  body: z.infer<typeof updateReviewSchema>["body"];
};
export type DeleteReviewInput = z.infer<typeof deleteReviewSchema>["params"];
