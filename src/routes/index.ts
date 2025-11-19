import { Router } from "express";
import authRoutes from "./auth.routes";
import productRoutes from "./product.routes";
import shopRoutes from "./shop.routes";
import shopProductRoutes from "./shop-product.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/shops", shopRoutes);
// Shop product routes are nested under shops routes
// They handle /shops/:shopId/products

export default router;
