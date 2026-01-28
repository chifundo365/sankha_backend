import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import {
  generateTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getRefreshTokenExpirySeconds,
  TokenPayload
} from "../services/token.service";
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshToken
} from "../utils/cookie";
import { passwordResetService } from "../services/passwordReset.service";

export const authController = {
  register: async (req: Request, res: Response) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        password,
        role
      } = req.body;

      // Check if user with the same email already exists
      const existingUser = await prisma.users.findUnique({
        where: { email }
      });

      if (existingUser) {
        return errorResponse(
          res,
          "User with this email already exists",
          null,
          409
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await prisma.users.create({
        data: {
          first_name,
          last_name,
          email,
          phone_number,
          password_hash: hashedPassword,
          role: role || "USER" // Default to USER role if not provided
        }
      });

      // Remove password_hash from response
      const { password_hash, ...userWithoutPassword } = newUser;

      return successResponse(
        res,
        "User registered successfully",
        userWithoutPassword
      );
    } catch (error) {
      console.log(error);
      return errorResponse(res, "User registration failed", null, 500);
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email }
      });

      if (!user) {
        return errorResponse(res, "invalid email or password", null, 401);
      }

      // Check if user is active
      if (!user.is_active) {
        return errorResponse(res, "Account is deactivated", null, 403);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!isPasswordValid) {
        return errorResponse(res, "invalid email or password", null, 401);
      }

      // Check if JWT_ACCESS_SECRET exists
      if (!process.env.JWT_ACCESS_SECRET) {
        console.error("JWT_ACCESS_SECRET is not defined in environment variables");
        return errorResponse(res, "Server configuration error", null, 500);
      }

      const payload: TokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      };

      // Get device info and IP for token tracking
      const deviceInfo = req.headers["user-agent"] || undefined;
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        undefined;

      // Generate token pair (access + refresh)
      const tokens = await generateTokenPair(payload, deviceInfo, ipAddress);

      // Set refresh token as httpOnly cookie (NOT in response body for security)
      setRefreshTokenCookie(res, tokens.refreshToken, getRefreshTokenExpirySeconds());

      const { password_hash, ...userWithoutPassword } = user;

      // Return ONLY access token in body - refresh token is in httpOnly cookie only
      return successResponse(res, "Login successful", {
        user: userWithoutPassword,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn
      });
    } catch (error) {
      console.error("Login error:", error);
      return errorResponse(res, "Login failed", null, 500);
    }
  },

  /**
   * Refresh access token using refresh token
   */
  refresh: async (req: Request, res: Response) => {
    try {
      // Get refresh token from httpOnly cookie or body (backward compatibility)
      const refreshToken = getRefreshToken(req);

      if (!refreshToken) {
        return errorResponse(res, "Refresh token is required", null, 400);
      }

      // Get device info and IP
      const deviceInfo = req.headers["user-agent"] || undefined;
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        undefined;

      // Rotate token (validates old, revokes it, issues new pair)
      const tokens = await rotateRefreshToken(refreshToken, deviceInfo, ipAddress);

      if (!tokens) {
        // Clear invalid cookie if present
        clearRefreshTokenCookie(res);
        return errorResponse(res, "Invalid or expired refresh token", null, 401);
      }

      // Set new refresh token as httpOnly cookie (NOT in response body for security)
      setRefreshTokenCookie(res, tokens.refreshToken, getRefreshTokenExpirySeconds());

      // Return ONLY access token in body - refresh token is in httpOnly cookie only
      return successResponse(res, "Token refreshed successfully", {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      return errorResponse(res, "Token refresh failed", null, 500);
    }
  },

  /**
   * Logout - revoke the current refresh token
   */
  logout: async (req: Request, res: Response) => {
    try {
      // Get refresh token from httpOnly cookie or body (backward compatibility)
      const refreshToken = getRefreshToken(req);

      if (!refreshToken) {
        // No token to revoke, just clear cookie and return success
        clearRefreshTokenCookie(res);
        return successResponse(res, "Logged out successfully", null);
      }

      await revokeRefreshToken(refreshToken);

      // Clear the httpOnly cookie
      clearRefreshTokenCookie(res);

      return successResponse(res, "Logged out successfully", null);
    } catch (error) {
      console.error("Logout error:", error);
      return errorResponse(res, "Logout failed", null, 500);
    }
  },

  /**
   * Logout from all devices - revoke all refresh tokens for the user
   */
  logoutAll: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return errorResponse(res, "User not authenticated", null, 401);
      }

      const revokedCount = await revokeAllUserTokens(userId);

      // Clear the httpOnly cookie for current session
      clearRefreshTokenCookie(res);

      return successResponse(res, "Logged out from all devices", {
        sessionsRevoked: revokedCount
      });
    } catch (error) {
      console.error("Logout all error:", error);
      return errorResponse(res, "Failed to logout from all devices", null, 500);
    }
  },

  /**
   * Request password reset (Forgot Password)
   * POST /api/auth/forgot-password
   */
  forgotPassword: async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      const result = await passwordResetService.requestPasswordReset(email);

      if (!result.success) {
        return errorResponse(res, result.message, null, 500);
      }

      // Build response data
      const responseData: any = {
        expiresInMinutes: passwordResetService.getTokenExpiryMinutes(),
      };

      // In development, include token for testing without email
      if (result.token) {
        responseData._dev_token = result.token;
        responseData._dev_reset_url = `/reset-password?token=${result.token}`;
      }

      return successResponse(res, result.message, responseData);
    } catch (error) {
      console.error("Forgot password error:", error);
      return errorResponse(res, "Failed to process request", null, 500);
    }
  },

  /**
   * Verify reset token is valid
   * GET /api/auth/verify-reset-token/:token
   */
  verifyResetToken: async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const result = await passwordResetService.verifyToken(token);

      if (!result.valid) {
        return errorResponse(res, result.error || "Invalid token", null, 400);
      }

      return successResponse(res, "Token is valid", {
        valid: true,
        expiresInMinutes: passwordResetService.getTokenExpiryMinutes()
      });
    } catch (error) {
      console.error("Verify reset token error:", error);
      return errorResponse(res, "Failed to verify token", null, 500);
    }
  },

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword: async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      const result = await passwordResetService.resetPassword(token, password);

      if (!result.success) {
        return errorResponse(res, result.message, null, 400);
      }

      return successResponse(res, result.message, null);
    } catch (error) {
      console.error("Reset password error:", error);
      return errorResponse(res, "Failed to reset password", null, 500);
    }
  }
};
