import { Request, Response } from "express";
import prisma from "../prismaClient";
import { successResponse, errorResponse } from "../utils/response";

export const reviewController = {
  /**
   * Create a review for a shop product
   * Business rules:
   * - Order must be DELIVERED
   * - Buyer must own the order
   * - Shop product must be in the order
   * - One review per shop_product per order (unique constraint)
   */
  createReview: async (req: Request, res: Response) => {
    try {
      const { order_id, shop_product_id, rating, comment } = req.body;
      const userId = req.user!.id;

      // 1. Verify order exists and belongs to user
      const order = await prisma.orders.findUnique({
        where: { id: order_id },
        include: {
          order_items: {
            where: { shop_product_id }
          }
        }
      });

      if (!order) {
        return errorResponse(res, "Order not found", null, 404);
      }

      if (order.buyer_id !== userId) {
        return errorResponse(
          res,
          "You can only review your own orders",
          null,
          403
        );
      }

      // 2. Verify order is DELIVERED
      if (order.status !== "DELIVERED") {
        return errorResponse(
          res,
          "Reviews can only be submitted for delivered orders",
          { current_status: order.status },
          400
        );
      }

      // 3. Verify shop product is in the order
      if (order.order_items.length === 0) {
        return errorResponse(
          res,
          "This product was not part of your order",
          null,
          400
        );
      }

      // 4. Check for duplicate review (handled by unique constraint, but let's be explicit)
      const existingReview = await prisma.reviews.findFirst({
        where: {
          order_id,
          shop_product_id
        }
      });

      if (existingReview) {
        return errorResponse(
          res,
          "You have already reviewed this product from this order",
          { review_id: existingReview.id },
          409
        );
      }

      // 5. Create the review
      const review = await prisma.reviews.create({
        data: {
          order_id,
          reviewer_id: userId,
          shop_product_id,
          rating,
          comment: comment || null
        },
        include: {
          shop_products: {
            include: {
              products: {
                select: {
                  name: true,
                  brand: true
                }
              },
              shops: {
                select: {
                  name: true
                }
              }
            }
          },
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true
            }
          }
        }
      });

      return successResponse(
        res,
        "Review submitted successfully",
        {
          review: {
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            product: review.shop_products.products.name,
            brand: review.shop_products.products.brand,
            shop: review.shop_products.shops.name,
            reviewer: {
              name: `${review.users.first_name} ${review.users.last_name}`
            },
            created_at: review.created_at
          }
        },
        201
      );
    } catch (error) {
      console.error("Error creating review:", error);
      return errorResponse(res, "Failed to create review", error instanceof Error ? error.message : "Unknown error");
    }
  },

  /**
   * Get reviews for a specific shop product
   * Includes average rating and review statistics
   */
  getShopProductReviews: async (req: Request, res: Response) => {
    try {
      const { shopProductId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Verify shop product exists
      const shopProduct = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        include: {
          products: {
            select: {
              name: true,
              brand: true
            }
          },
          shops: {
            select: {
              name: true
            }
          }
        }
      });

      if (!shopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Get reviews with pagination
      const [reviews, totalCount, ratingStats] = await Promise.all([
        prisma.reviews.findMany({
          where: { shop_product_id: shopProductId },
          include: {
            users: {
              select: {
                id: true,
                first_name: true,
                last_name: true
              }
            },
            orders: {
              select: {
                order_number: true,
                created_at: true
              }
            }
          },
          orderBy: { created_at: "desc" },
          skip,
          take
        }),
        prisma.reviews.count({
          where: { shop_product_id: shopProductId }
        }),
        // Calculate rating statistics
        prisma.reviews.groupBy({
          by: ["rating"],
          where: { shop_product_id: shopProductId },
          _count: {
            rating: true
          }
        })
      ]);

      // Calculate average rating
      const allReviews = await prisma.reviews.findMany({
        where: { shop_product_id: shopProductId },
        select: { rating: true }
      });

      const averageRating =
        allReviews.length > 0
          ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
          : 0;

      // Build rating breakdown
      const ratingBreakdown = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      };

      ratingStats.forEach(stat => {
        ratingBreakdown[stat.rating as keyof typeof ratingBreakdown] =
          stat._count.rating;
      });

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(res, "Reviews retrieved successfully", {
        product: {
          id: shopProduct.id,
          name: shopProduct.products.name,
          brand: shopProduct.products.brand,
          shop: shopProduct.shops.name
        },
        rating_summary: {
          average_rating: Number(averageRating.toFixed(2)),
          total_reviews: totalCount,
          rating_breakdown: ratingBreakdown
        },
        reviews: reviews.map(review => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          reviewer: {
            name: `${review.users.first_name} ${review.users.last_name}`
          },
          order_number: review.orders.order_number,
          created_at: review.created_at,
          updated_at: review.updated_at
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: take,
          hasNextPage: Number(page) < totalPages,
          hasPreviousPage: Number(page) > 1
        }
      });
    } catch (error) {
      console.error("Error getting shop product reviews:", error);
      return errorResponse(res, "Failed to retrieve reviews", error instanceof Error ? error.message : "Unknown error");
    }
  },

  /**
   * Get all reviews for a shop (across all products)
   */
  getShopReviews: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const { page = 1, limit = 10, rating } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Verify shop exists
      const shop = await prisma.shops.findUnique({
        where: { id: shopId },
        select: { name: true }
      });

      if (!shop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      // Build where clause
      const where: any = {
        shop_products: {
          shop_id: shopId
        }
      };

      if (rating) {
        where.rating = Number(rating);
      }

      // Get reviews
      const [reviews, totalCount] = await Promise.all([
        prisma.reviews.findMany({
          where,
          include: {
            users: {
              select: {
                first_name: true,
                last_name: true
              }
            },
            shop_products: {
              include: {
                products: {
                  select: {
                    name: true,
                    brand: true
                  }
                }
              }
            }
          },
          orderBy: { created_at: "desc" },
          skip,
          take
        }),
        prisma.reviews.count({ where })
      ]);

      // Calculate average rating for shop
      const allShopReviews = await prisma.reviews.findMany({
        where: {
          shop_products: {
            shop_id: shopId
          }
        },
        select: { rating: true }
      });

      const averageRating =
        allShopReviews.length > 0
          ? allShopReviews.reduce((sum, r) => sum + r.rating, 0) /
            allShopReviews.length
          : 0;

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(res, "Shop reviews retrieved successfully", {
        shop: {
          id: shopId,
          name: shop.name,
          average_rating: Number(averageRating.toFixed(2)),
          total_reviews: allShopReviews.length
        },
        reviews: reviews.map(review => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          product: {
            name: review.shop_products.products.name,
            brand: review.shop_products.products.brand
          },
          reviewer: {
            name: `${review.users.first_name} ${review.users.last_name}`
          },
          created_at: review.created_at
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: take,
          hasNextPage: Number(page) < totalPages,
          hasPreviousPage: Number(page) > 1
        }
      });
    } catch (error) {
      console.error("Error getting shop reviews:", error);
      return errorResponse(
        res,
        "Failed to retrieve shop reviews",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  },

  /**
   * Get user's own reviews
   */
  getMyReviews: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [reviews, totalCount] = await Promise.all([
        prisma.reviews.findMany({
          where: { reviewer_id: userId },
          include: {
            shop_products: {
              include: {
                products: {
                  select: {
                    name: true,
                    brand: true,
                    images: true
                  }
                },
                shops: {
                  select: {
                    name: true
                  }
                }
              }
            },
            orders: {
              select: {
                order_number: true
              }
            }
          },
          orderBy: { created_at: "desc" },
          skip,
          take
        }),
        prisma.reviews.count({
          where: { reviewer_id: userId }
        })
      ]);

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(res, "Your reviews retrieved successfully", {
        reviews: reviews.map(review => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          product: {
            name: review.shop_products.products.name,
            brand: review.shop_products.products.brand,
            image: review.shop_products.products.images[0] || null
          },
          shop: review.shop_products.shops.name,
          order_number: review.orders.order_number,
          created_at: review.created_at,
          updated_at: review.updated_at
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: take,
          hasNextPage: Number(page) < totalPages,
          hasPreviousPage: Number(page) > 1
        }
      });
    } catch (error) {
      console.error("Error getting user reviews:", error);
      return errorResponse(
        res,
        "Failed to retrieve your reviews",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  },

  /**
   * Update a review
   * Only the reviewer can update their own review
   */
  updateReview: async (req: Request, res: Response) => {
    try {
      const { reviewId } = req.params;
      const { rating, comment } = req.body;
      const userId = req.user!.id;

      // Find review
      const review = await prisma.reviews.findUnique({
        where: { id: reviewId }
      });

      if (!review) {
        return errorResponse(res, "Review not found", null, 404);
      }

      // Verify ownership
      if (review.reviewer_id !== userId) {
        return errorResponse(
          res,
          "You can only update your own reviews",
          null,
          403
        );
      }

      // Update review
      const updatedReview = await prisma.reviews.update({
        where: { id: reviewId },
        data: {
          ...rating !== undefined && { rating },
          ...comment !== undefined && { comment },
          updated_at: new Date()
        },
        include: {
          shop_products: {
            include: {
              products: {
                select: {
                  name: true
                }
              },
              shops: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });

      return successResponse(res, "Review updated successfully", {
        review: {
          id: updatedReview.id,
          rating: updatedReview.rating,
          comment: updatedReview.comment,
          product: updatedReview.shop_products.products.name,
          shop: updatedReview.shop_products.shops.name,
          updated_at: updatedReview.updated_at
        }
      });
    } catch (error) {
      console.error("Error updating review:", error);
      return errorResponse(res, "Failed to update review", error instanceof Error ? error.message : "Unknown error");
    }
  },

  /**
   * Delete a review
   * Only reviewer or admin can delete
   */
  deleteReview: async (req: Request, res: Response) => {
    try {
      const { reviewId } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Find review
      const review = await prisma.reviews.findUnique({
        where: { id: reviewId }
      });

      if (!review) {
        return errorResponse(res, "Review not found", null, 404);
      }

      // Check authorization
      const isOwner = review.reviewer_id === userId;
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

      if (!isOwner && !isAdmin) {
        return errorResponse(
          res,
          "You are not authorized to delete this review",
          null,
          403
        );
      }

      // Delete review
      await prisma.reviews.delete({
        where: { id: reviewId }
      });

      return successResponse(res, "Review deleted successfully", null);
    } catch (error) {
      console.error("Error deleting review:", error);
      return errorResponse(res, "Failed to delete review", error instanceof Error ? error.message : "Unknown error");
    }
  }
};
