import { Response, CookieOptions } from "express";

// Cookie name for refresh token
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Get cookie options based on environment
 */
const getCookieOptions = (maxAge?: number): CookieOptions => {
  const isProduction = process.env.NODE_ENV === "production";
  
  return {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? "strict" : "lax", // CSRF protection
    path: "/api/auth", // Only sent to auth routes
    maxAge: maxAge, // In milliseconds
  };
};

/**
 * Set refresh token as httpOnly cookie
 */
export const setRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  expiresInSeconds: number
): void => {
  const maxAge = expiresInSeconds * 1000; // Convert to milliseconds
  
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getCookieOptions(maxAge));
};

/**
 * Clear refresh token cookie
 */
export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/api/auth",
  });
};

/**
 * Get refresh token from cookie or request body (backward compatibility)
 */
export const getRefreshToken = (req: any): string | undefined => {
  // First try to get from httpOnly cookie
  const cookieToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }
  
  // Fallback to request body (for backward compatibility / mobile apps)
  return req.body?.refreshToken;
};
