import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { errorResponse } from "../utils/response";
import { user_role } from "../../generated/prisma";

interface JwtPayload {
  id: string;
  email: string;
  role: user_role;
  first_name: string;
  last_name: string;
}

/**
 * Middleware to verify JWT token and attach user data to request
 */
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      errorResponse(res, "Not authorized, no token provided", 401);
      return;
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    if (!token) {
      errorResponse(res, "Not authorized, token missing", 401);
      return;
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      errorResponse(res, "Server configuration error", 500);
      return;
    }

    try {
      // @ts-ignore - Type mismatch between jsonwebtoken and @types/jsonwebtoken
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

      // Attach user data to request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        first_name: decoded.first_name,
        last_name: decoded.last_name
      };

      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        errorResponse(res, "Token expired, please login again", 401);
        return;
      }

      if (jwtError instanceof jwt.JsonWebTokenError) {
        errorResponse(res, "Invalid token", 401);
        return;
      }

      errorResponse(res, "Token verification failed", 401);
      return;
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    errorResponse(res, "Authentication error", 500);
  }
};
