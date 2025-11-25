import { Router } from "express";
import { reviewController } from "../controllers/review.controller";
import { protect } from "../middleware/auth.middleware";
import validateResource from "../middleware/validateResource";
import {
  createReviewSchema,
  getShopProductReviewsSchema,
  getShopReviewsSchema,
  getMyReviewsSchema,
  updateReviewSchema,
  deleteReviewSchema
} from "../schemas/review.schema";

const router = Router();

/**
 * @route   POST /api/reviews
 * @desc    Create a review for a shop product (after order delivered)
 * @access  Private (USER)
 */
router.post(
  "/",
  protect,
  validateResource(createReviewSchema),
  reviewController.createReview
);

/**
 * @route   GET /api/reviews/my-reviews
 * @desc    Get logged-in user's reviews
 * @access  Private (USER)
 */
router.get(
  "/my-reviews",
  protect,
  validateResource(getMyReviewsSchema),
  reviewController.getMyReviews
);

/**
 * @route   GET /api/reviews/shop-product/:shopProductId
 * @desc    Get all reviews for a specific shop product
 * @access  Public
 */
router.get(
  "/shop-product/:shopProductId",
  validateResource(getShopProductReviewsSchema),
  reviewController.getShopProductReviews
);

/**
 * @route   GET /api/reviews/shop/:shopId
 * @desc    Get all reviews for a shop (across all products)
 * @access  Public
 */
router.get(
  "/shop/:shopId",
  validateResource(getShopReviewsSchema),
  reviewController.getShopReviews
);

/**
 * @route   PUT /api/reviews/:reviewId
 * @desc    Update a review
 * @access  Private (Review owner only)
 */
router.put(
  "/:reviewId",
  protect,
  validateResource(updateReviewSchema),
  reviewController.updateReview
);

/**
 * @route   DELETE /api/reviews/:reviewId
 * @desc    Delete a review
 * @access  Private (Review owner or ADMIN)
 */
router.delete(
  "/:reviewId",
  protect,
  validateResource(deleteReviewSchema),
  reviewController.deleteReview
);

export default router;
