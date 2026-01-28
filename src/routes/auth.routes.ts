import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import validateResource from "../middleware/validateResource";
import { 
  loginSchema, 
  registerSchema, 
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetTokenSchema
} from "../schemas/auth.schema";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import { Request, Response } from "express";
import { successResponse } from "../utils/response";
import { rateLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

// Localhost whitelist for development/testing
const localhostWhitelist = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

// Strict rate limiter with localhost whitelist
const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many attempts, please try again after 15 minutes.',
  whitelist: localhostWhitelist,
});

// Apply strict rate limiting for register (5 attempts per 15 minutes)
router.post(
  "/register",
  strictRateLimiter,
  validateResource(registerSchema),
  authController.register
);

// Apply strict rate limiting for login (5 attempts per 15 minutes)
router.post(
  "/login",
  strictRateLimiter,
  validateResource(loginSchema),
  authController.login
);

// Refresh token endpoint - rate limited to prevent abuse
router.post(
  "/refresh",
  rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    whitelist: localhostWhitelist,
  }),
  validateResource(refreshTokenSchema),
  authController.refresh
);

// Logout - revoke current refresh token
router.post(
  "/logout",
  validateResource(refreshTokenSchema),
  authController.logout
);

// Logout from all devices - requires authentication
router.post("/logout-all", protect, authController.logoutAll);

// ==================== PASSWORD RESET ROUTES ====================

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
router.post(
  "/forgot-password",
  strictRateLimiter,  // Strict rate limiting to prevent abuse
  validateResource(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @route   GET /api/auth/verify-reset-token/:token
 * @desc    Verify if reset token is valid (for frontend to show reset form)
 * @access  Public
 */
router.get(
  "/verify-reset-token/:token",
  validateResource(verifyResetTokenSchema),
  authController.verifyResetToken
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  "/reset-password",
  strictRateLimiter,  // Strict rate limiting
  validateResource(resetPasswordSchema),
  authController.resetPassword
);

// ==================== PROTECTED ROUTES ====================

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
