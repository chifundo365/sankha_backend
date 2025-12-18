import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redisClient } from "../config/redis.config";
import { user_role } from "../../generated/prisma";

// Redis key prefixes
const REFRESH_TOKEN_PREFIX = "refresh_token:";
const USER_TOKENS_PREFIX = "user_tokens:";

/**
 * Parse duration string (e.g., "15m", "7d") to seconds
 */
const parseDurationToSeconds = (duration: string, defaultSeconds: number): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return defaultSeconds;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 60 * 60;
    case "d": return value * 24 * 60 * 60;
    default: return defaultSeconds;
  }
};

/**
 * Get access token expiry from environment
 */
const getAccessTokenExpiry = (): string => {
  return process.env.JWT_ACCESS_EXPIRES_IN || "15m";
};

/**
 * Get refresh token expiry in seconds from environment
 */
export const getRefreshTokenExpirySeconds = (): number => {
  const expiryEnv = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  return parseDurationToSeconds(expiryEnv, 7 * 24 * 60 * 60);
};

export interface TokenPayload {
  id: string;
  email: string;
  role: user_role;
  first_name: string;
  last_name: string;
}

export interface RefreshTokenData {
  userId: string;
  email: string;
  role: user_role;
  firstName: string;
  lastName: string;
  deviceInfo?: string;
  ipAddress?: string;
  createdAt: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate a cryptographically secure random token
 */
const generateSecureToken = (): string => {
  return crypto.randomBytes(64).toString("hex");
};

/**
 * Hash a token using SHA-256 for secure storage
 */
const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate an access token (JWT)
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  const jwtSecret = process.env.JWT_ACCESS_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_ACCESS_SECRET is not defined");
  }

  // @ts-ignore - Type mismatch with jsonwebtoken
  return jwt.sign(payload, jwtSecret, {
    expiresIn: getAccessTokenExpiry()
  });
};

/**
 * Generate and store a refresh token in Redis
 */
export const generateRefreshToken = async (
  payload: TokenPayload,
  deviceInfo?: string,
  ipAddress?: string
): Promise<string> => {
  const redis = await redisClient.getClient();
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expirySeconds = getRefreshTokenExpirySeconds();

  const tokenData: RefreshTokenData = {
    userId: payload.id,
    email: payload.email,
    role: payload.role,
    firstName: payload.first_name,
    lastName: payload.last_name,
    deviceInfo,
    ipAddress,
    createdAt: Date.now()
  };

  // Store token hash -> token data (with TTL)
  await redis.setEx(
    `${REFRESH_TOKEN_PREFIX}${tokenHash}`,
    expirySeconds,
    JSON.stringify(tokenData)
  );

  // Track token for this user (for logout-all functionality)
  await redis.sAdd(`${USER_TOKENS_PREFIX}${payload.id}`, tokenHash);
  // Set expiry on user tokens set (cleanup)
  await redis.expire(`${USER_TOKENS_PREFIX}${payload.id}`, expirySeconds);

  return token;
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = async (
  payload: TokenPayload,
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair> => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload, deviceInfo, ipAddress);

  // Calculate access token expiry in seconds for client
  const expiresIn = parseDurationToSeconds(getAccessTokenExpiry(), 900);

  return {
    accessToken,
    refreshToken,
    expiresIn
  };
};

/**
 * Validate a refresh token and return the associated user data
 */
export const validateRefreshToken = async (
  token: string
): Promise<RefreshTokenData | null> => {
  try {
    const redis = await redisClient.getClient();
    const tokenHash = hashToken(token);
    const key = `${REFRESH_TOKEN_PREFIX}${tokenHash}`;

    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as RefreshTokenData;
  } catch (error) {
    console.error("Error validating refresh token:", error);
    return null;
  }
};

/**
 * Revoke a specific refresh token
 */
export const revokeRefreshToken = async (token: string): Promise<boolean> => {
  try {
    const redis = await redisClient.getClient();
    const tokenHash = hashToken(token);
    const key = `${REFRESH_TOKEN_PREFIX}${tokenHash}`;

    // Get token data to find user ID
    const data = await redis.get(key);
    if (data) {
      const tokenData = JSON.parse(data) as RefreshTokenData;
      // Remove from user's token set
      await redis.sRem(`${USER_TOKENS_PREFIX}${tokenData.userId}`, tokenHash);
    }

    // Delete the token
    const result = await redis.del(key);
    return result > 0;
  } catch (error) {
    console.error("Error revoking refresh token:", error);
    return false;
  }
};

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
export const revokeAllUserTokens = async (userId: string): Promise<number> => {
  try {
    const redis = await redisClient.getClient();
    const userTokensKey = `${USER_TOKENS_PREFIX}${userId}`;

    // Get all token hashes for this user
    const tokenHashes = await redis.sMembers(userTokensKey);

    if (tokenHashes.length === 0) {
      return 0;
    }

    // Delete all refresh tokens
    const tokenKeys = tokenHashes.map((hash) => `${REFRESH_TOKEN_PREFIX}${hash}`);
    const deleted = await redis.del(tokenKeys);

    // Delete the user's token set
    await redis.del(userTokensKey);

    return deleted;
  } catch (error) {
    console.error("Error revoking all user tokens:", error);
    return 0;
  }
};

/**
 * Rotate refresh token (revoke old, issue new) - Token rotation for security
 */
export const rotateRefreshToken = async (
  oldToken: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair | null> => {
  // Validate the old token
  const tokenData = await validateRefreshToken(oldToken);

  if (!tokenData) {
    return null;
  }

  // Revoke the old token
  await revokeRefreshToken(oldToken);

  // Generate new token pair
  const payload: TokenPayload = {
    id: tokenData.userId,
    email: tokenData.email,
    role: tokenData.role,
    first_name: tokenData.firstName,
    last_name: tokenData.lastName
  };

  return generateTokenPair(payload, deviceInfo, ipAddress);
};

/**
 * Get active session count for a user
 */
export const getUserSessionCount = async (userId: string): Promise<number> => {
  try {
    const redis = await redisClient.getClient();
    return await redis.sCard(`${USER_TOKENS_PREFIX}${userId}`);
  } catch (error) {
    console.error("Error getting user session count:", error);
    return 0;
  }
};

/**
 * Clean up expired tokens from user's token set
 * This is a maintenance function that can be called periodically
 */
export const cleanupUserTokens = async (userId: string): Promise<void> => {
  try {
    const redis = await redisClient.getClient();
    const userTokensKey = `${USER_TOKENS_PREFIX}${userId}`;
    const tokenHashes = await redis.sMembers(userTokensKey);

    for (const hash of tokenHashes) {
      const exists = await redis.exists(`${REFRESH_TOKEN_PREFIX}${hash}`);
      if (!exists) {
        await redis.sRem(userTokensKey, hash);
      }
    }
  } catch (error) {
    console.error("Error cleaning up user tokens:", error);
  }
};
