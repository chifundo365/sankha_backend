import { Router } from "express";
import {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from "../controllers/cart.controller";
import { protect } from "../middleware/auth.middleware";
import validateResource from "../middleware/validateResource";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeFromCartSchema,
  getCartSchema,
  clearCartSchema
} from "../schemas/cart.schema";

const router = Router();

/**
 * All cart routes require authentication
 * Users can only access their own cart
 */

/**
 * @route   GET /api/cart
 * @desc    Get user's cart (all items from all shops)
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.get("/", protect, validateResource(getCartSchema), getCart);

/**
 * @route   POST /api/cart
 * @desc    Add item to cart
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.post("/", protect, validateResource(addToCartSchema), addToCart);

/**
 * @route   PUT /api/cart/items/:itemId
 * @desc    Update cart item quantity
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.put(
  "/items/:itemId",
  protect,
  validateResource(updateCartItemSchema),
  updateCartItem
);

/**
 * @route   DELETE /api/cart/items/:itemId
 * @desc    Remove item from cart
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.delete(
  "/items/:itemId",
  protect,
  validateResource(removeFromCartSchema),
  removeFromCart
);

/**
 * @route   DELETE /api/cart
 * @desc    Clear entire cart (all items from all shops)
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.delete("/", protect, validateResource(clearCartSchema), clearCart);

export default router;
