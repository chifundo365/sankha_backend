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

const router = Router();

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/shops", shopRoutes);
router.use("/addresses", addressRoutes);
router.use("/users", userRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);
// Shop product routes are nested under shops routes
// They handle /shops/:shopId/products

export default router;
