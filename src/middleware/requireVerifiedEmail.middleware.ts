import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";
import { errorResponse } from "../utils/response";

/**
 * Ensures the authenticated user has a verified email before proceeding.
 * Uses a fresh DB read to avoid stale JWT claims.
 */
export const requireVerifiedEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return errorResponse(res, "User not authenticated", null, 401);
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { email_verified: true }
    });

    if (!user?.email_verified) {
      return errorResponse(
        res,
        "Please verify your email to continue",
        null,
        403
      );
    }

    return next();
  } catch (error) {
    console.error("requireVerifiedEmail error:", error);
    return errorResponse(res, "Failed to validate email verification status", null, 500);
  }
};
