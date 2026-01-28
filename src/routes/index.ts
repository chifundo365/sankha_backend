import { Router } from "express";
import authRoutes from "./auth.routes";
import productRoutes from "./product.routes";
import shopRoutes from "./shop.routes";
import shopProductRoutes from "./shop-product.routes";
import cartRoutes from "./cart.routes";
import orderRoutes from "./order.routes";
import reviewRoutes from "./review.routes";
import categoryRoutes from "./category.routes";
import addressRoutes from "./address.routes";
import userRoutes from "./user.routes";
import adminRoutes from "./admin.routes";
import paymentRoutes from "./payment.routes";
import withdrawalRoutes from "./withdrawal.routes";
import { rateLimiter } from "../middleware/rateLimiter.middleware";
import { ipBlocker } from "../middleware/ipBlocker.middleware";

const router = Router();

// Localhost whitelist for development/testing
const localhostWhitelist = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

// IP Blocker - Check if IP is blocked before processing any request
router.use(ipBlocker({
  whitelist: localhostWhitelist,
}));

// Global rate limiter for all API routes (100 requests per 15 minutes)
// Localhost is whitelisted for development/testing
router.use(rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  whitelist: localhostWhitelist,
}));

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/shops", shopRoutes);
router.use("/addresses", addressRoutes);
router.use("/users", userRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);
router.use("/admin", adminRoutes);
router.use("/payments", paymentRoutes);
router.use("/withdrawals", withdrawalRoutes);
// Shop product routes are nested under shops routes
// They handle /shops/:shopId/products

export default router;
