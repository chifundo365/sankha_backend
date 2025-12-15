import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import validateResource from "../middleware/validateResource";
import { loginSchema, registerSchema } from "../schemas/auth.schema";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import { Request, Response } from "express";
import { successResponse } from "../utils/response";
import { rateLimitPresets } from "../middleware/rateLimiter.middleware";

const router = Router();

// Apply strict rate limiting for register (5 attempts per 15 minutes)
router.post(
  "/register",
  rateLimitPresets.strict,
  validateResource(registerSchema),
  authController.register
);

// Apply strict rate limiting for login (5 attempts per 15 minutes)
router.post(
  "/login",
  rateLimitPresets.strict,
  validateResource(loginSchema),
  authController.login
);

// Protected route - requires authentication
router.get("/me", protect, (req: Request, res: Response) => {
  successResponse(res, "User profile retrieved successfully", req.user, 200);
});

// Admin-only route - requires ADMIN or SUPER_ADMIN role
router.get(
  "/admin",
  protect,
  authorize("ADMIN", "SUPER_ADMIN"),
  (req: Request, res: Response) => {
    successResponse(
      res,
      "Access granted",
      { message: "Welcome to admin area", user: req.user },
      200
    );
  }
);

// Seller route - requires SELLER, ADMIN, or SUPER_ADMIN role
router.get(
  "/seller",
  protect,
  authorize("SELLER", "ADMIN", "SUPER_ADMIN"),
  (req: Request, res: Response) => {
    successResponse(
      res,
      "Access granted",
      { message: "Welcome to seller dashboard", user: req.user },
      200
    );
  }
);

export default router;
