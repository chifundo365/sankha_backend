import { Request, Response, NextFunction } from "express";
import { user_role } from "../../generated/prisma";
import { errorResponse } from "../utils/response";

/**
 * Middleware to check if user has required role(s)
 * Must be used after protect middleware
 */
export const authorize = (...allowedRoles: user_role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      errorResponse(res, "Not authenticated", 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      errorResponse(
        res,
        `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
        403
      );
      return;
    }

    next();
  };
};
