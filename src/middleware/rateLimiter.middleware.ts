import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis.config';
import { errorResponse } from '../utils/response';
import { ipBlockerService } from './ipBlocker.middleware';

export interface RateLimiterOptions {
  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Maximum number of requests per window
   * @default 100
   */
  max?: number;

  /**
   * Custom key generator function
   * @default Uses IP address
   */
  keyGenerator?: (req: Request) => string;

  /**
   * Message to send when rate limit is exceeded
   */
  message?: string;

  /**
   * Status code to send when rate limit is exceeded
   * @default 429
   */
  statusCode?: number;

  /**
   * Skip successful requests (don't count them)
   * @default false
   */
  skipSuccessfulRequests?: boolean;

  /**
   * Skip failed requests (don't count them)
   * @default false
   */
  skipFailedRequests?: boolean;

  /**
   * Custom handler when rate limit is exceeded
   */
  handler?: (req: Request, res: Response) => void;

  /**
   * Skip rate limiting based on condition
   */
  skip?: (req: Request) => boolean;

  /**
   * Whitelist of IPs to skip rate limiting
   */
  whitelist?: string[];

  /**
   * Redis key prefix
   * @default 'sankha:ratelimit'
   */
  keyPrefix?: string;
}

/**
 * Create a custom rate limiter middleware using Redis
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    handler,
    skip,
    whitelist = [],
    keyPrefix = 'sankha:ratelimit',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if we should skip rate limiting for this request
      if (skip && skip(req)) {
        return next();
      }

      const identifier = keyGenerator(req);

      // Check whitelist
      if (whitelist.includes(identifier)) {
        return next();
      }

      const client = await redisClient.getClient();
      
      // Create time-based window key
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const redisKey = `${keyPrefix}:${identifier}:${windowStart}`;

      // Get current count
      const currentCount = await client.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      // Calculate remaining requests and reset time
      const remaining = Math.max(0, max - count - 1);
      const resetTime = windowStart + windowMs;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      // Check if limit exceeded
      if (count >= max) {
        const retryAfter = Math.ceil((resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.setHeader('X-RateLimit-Remaining', 0);

        // Record violation for IP blocking
        const endpoint = `${req.method}:${req.path}`;
        ipBlockerService.recordViolation(identifier, endpoint, {
          violationThreshold: 3,
          baseBlockDuration: 900, // 15 minutes
          maxBlockDuration: 86400, // 24 hours
        }).catch(err => console.error('Error recording violation:', err));

        if (handler) {
          return handler(req, res);
        }

        return errorResponse(res, message, { 
          retryAfter: retryAfter,
          limit: max,
          windowMs: windowMs 
        }, statusCode);
      }

      // Increment counter logic based on skipSuccessfulRequests/skipFailedRequests
      if (!skipSuccessfulRequests && !skipFailedRequests) {
        // Count all requests immediately
        await client.incr(redisKey);
        await client.pExpire(redisKey, windowMs);
      } else {
        // Conditionally count based on response
        const originalSend = res.send;
        res.send = function (data: any) {
          const shouldCount = 
            (!skipSuccessfulRequests && res.statusCode < 400) ||
            (!skipFailedRequests && res.statusCode >= 400);

          if (shouldCount) {
            client.incr(redisKey).then(() => {
              client.pExpire(redisKey, windowMs);
            });
          }

          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // If Redis fails, allow the request to proceed (fail open)
      next();
    }
  };
}

/**
 * Create IP-based rate limiter
 */
export function ipRateLimiter(options: Omit<RateLimiterOptions, 'keyGenerator'> = {}) {
  return rateLimiter({
    ...options,
    keyGenerator: (req: Request) => req.ip || 'unknown',
  });
}

/**
 * Create user-based rate limiter (for authenticated routes)
 */
export function userRateLimiter(options: Omit<RateLimiterOptions, 'keyGenerator'> = {}) {
  return rateLimiter({
    ...options,
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return req.user?.id?.toString() || req.ip || 'unknown';
    },
  });
}

/**
 * Create endpoint-specific rate limiter
 */
export function endpointRateLimiter(options: Omit<RateLimiterOptions, 'keyGenerator'> = {}) {
  return rateLimiter({
    ...options,
    keyGenerator: (req: Request) => {
      const identifier = req.user?.id?.toString() || req.ip || 'unknown';
      const endpoint = `${req.method}:${req.path}`;
      return `${identifier}:${endpoint}`;
    },
  });
}

/**
 * Preset rate limiters for common scenarios
 */
export const rateLimitPresets = {
  // Strict limit for sensitive endpoints (e.g., login, register)
  strict: rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many attempts, please try again after 15 minutes.',
  }),

  // Moderate limit for auth-related endpoints
  auth: rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Too many requests to authentication endpoints.',
  }),

  // Standard limit for general API endpoints
  standard: rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  }),

  // Relaxed limit for read-only operations
  relaxed: rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
  }),

  // Very strict limit for resource-intensive operations
  heavy: rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'This operation is rate-limited to 10 requests per hour.',
  }),
};
