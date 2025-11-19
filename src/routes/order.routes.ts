import { Router } from "express";
import {
  checkout,
  getOrderById,
  getMyOrders,
  getShopOrders,
  updateOrderStatus,
  cancelOrder
} from "../controllers/order.controller";
import { protect } from "../middleware/auth.middleware";
import validateResource from "../middleware/validateResource";
import {
  checkoutSchema,
  getOrderSchema,
  listOrdersSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  getShopOrdersSchema
} from "../schemas/order.schema";

const router = Router();

/**
 * All order routes require authentication
 */

/**
 * @route   POST /api/orders/checkout
 * @desc    Checkout - Convert cart(s) to confirmed order(s)
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.post("/checkout", protect, validateResource(checkoutSchema), checkout);

/**
 * @route   GET /api/orders/my-orders
 * @desc    Get my orders (buyer view)
 * @access  Protected (USER, SELLER, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/my-orders",
  protect,
  validateResource(listOrdersSchema),
  getMyOrders
);

/**
 * @route   GET /api/orders/shop/:shopId
 * @desc    Get shop orders (seller view)
 * @access  Protected (SELLER/shop owner, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/shop/:shopId",
  protect,
  validateResource(getShopOrdersSchema),
  getShopOrders
);

/**
 * @route   GET /api/orders/:orderId
 * @desc    Get single order details
 * @access  Protected (Buyer, Shop owner, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/:orderId",
  protect,
  validateResource(getOrderSchema),
  getOrderById
);

/**
 * @route   PATCH /api/orders/:orderId/status
 * @desc    Update order status (seller workflow)
 * @access  Protected (Shop owner, ADMIN, SUPER_ADMIN)
 */
router.patch(
  "/:orderId/status",
  protect,
  validateResource(updateOrderStatusSchema),
  updateOrderStatus
);

/**
 * @route   POST /api/orders/:orderId/cancel
 * @desc    Cancel order
 * @access  Protected (Buyer, Shop owner, ADMIN, SUPER_ADMIN)
 */
router.post(
  "/:orderId/cancel",
  protect,
  validateResource(cancelOrderSchema),
  cancelOrder
);

export default router;
