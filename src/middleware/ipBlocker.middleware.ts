import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis.config';
import { errorResponse } from '../utils/response';

export interface IPBlockerOptions {
  /**
   * Number of rate limit violations before temporary block
   * @default 3
   */
  violationThreshold?: number;

  /**
   * Base block duration in seconds
   * @default 900 (15 minutes)
   */
  baseBlockDuration?: number;

  /**
   * Maximum block duration in seconds
   * @default 86400 (24 hours)
   */
  maxBlockDuration?: number;

  /**
   * Multiplier for progressive blocking
   * @default 2
   */
  blockMultiplier?: number;

  /**
   * Time window to track violations (in seconds)
   * @default 3600 (1 hour)
   */
  violationWindow?: number;

  /**
   * Whitelist of IPs that should never be blocked
   */
  whitelist?: string[];

  /**
   * Redis key prefix
   * @default 'sankha:ipblock'
   */
  keyPrefix?: string;

  /**
   * Custom message when IP is blocked
   */
  message?: string;
}

interface BlockInfo {
  blockedAt: number;
  expiresAt: number;
  violations: number;
  reason: string;
}

interface ViolationInfo {
  count: number;
  lastViolation: number;
  endpoints: string[];
}

/**
 * IP Blocker Service - handles all IP blocking operations
 */
class IPBlockerService {
  private static instance: IPBlockerService;
  private keyPrefix: string = 'sankha:ipblock';
  private violationPrefix: string = 'sankha:violations';

  private constructor() {}

  public static getInstance(): IPBlockerService {
    if (!IPBlockerService.instance) {
      IPBlockerService.instance = new IPBlockerService();
    }
    return IPBlockerService.instance;
  }

  /**
   * Check if an IP is currently blocked
   */
  async isBlocked(ip: string): Promise<BlockInfo | null> {
    try {
      const client = await redisClient.getClient();
      const blockData = await client.get(`${this.keyPrefix}:${ip}`);
      
      if (!blockData) return null;

      const blockInfo: BlockInfo = JSON.parse(blockData);
      
      // Check if block has expired
      if (Date.now() > blockInfo.expiresAt) {
        await this.unblock(ip);
        return null;
      }

      return blockInfo;
    } catch (error) {
      console.error('IP Blocker - Error checking block status:', error);
      return null;
    }
  }

  /**
   * Record a rate limit violation for an IP
   */
  async recordViolation(ip: string, endpoint: string, options: IPBlockerOptions = {}): Promise<ViolationInfo> {
    const {
      violationThreshold = 3,
      baseBlockDuration = 900,
      maxBlockDuration = 86400,
      blockMultiplier = 2,
      violationWindow = 3600,
    } = options;

    try {
      const client = await redisClient.getClient();
      const violationKey = `${this.violationPrefix}:${ip}`;
      
      // Get current violations
      const existingData = await client.get(violationKey);
      let violationInfo: ViolationInfo = existingData 
        ? JSON.parse(existingData) 
        : { count: 0, lastViolation: 0, endpoints: [] };

      // Increment violation count
      violationInfo.count += 1;
      violationInfo.lastViolation = Date.now();
      
      // Track which endpoints are being abused
      if (!violationInfo.endpoints.includes(endpoint)) {
        violationInfo.endpoints.push(endpoint);
      }

      // Save updated violations
      await client.set(violationKey, JSON.stringify(violationInfo), { EX: violationWindow });

      console.log(`IP Blocker - Violation recorded for ${ip}: ${violationInfo.count} violations`);

      // Check if we should block this IP
      if (violationInfo.count >= violationThreshold) {
        // Calculate progressive block duration
        const blockLevel = Math.floor((violationInfo.count - violationThreshold) / 2) + 1;
        const blockDuration = Math.min(
          baseBlockDuration * Math.pow(blockMultiplier, blockLevel - 1),
          maxBlockDuration
        );

        await this.block(ip, blockDuration, violationInfo.count, 
          `Exceeded rate limit ${violationInfo.count} times on endpoints: ${violationInfo.endpoints.join(', ')}`);
      }

      return violationInfo;
    } catch (error) {
      console.error('IP Blocker - Error recording violation:', error);
      return { count: 0, lastViolation: Date.now(), endpoints: [] };
    }
  }

  /**
   * Block an IP address
   */
  async block(ip: string, durationSeconds: number, violations: number, reason: string): Promise<void> {
    try {
      const client = await redisClient.getClient();
      const now = Date.now();
      
      const blockInfo: BlockInfo = {
        blockedAt: now,
        expiresAt: now + (durationSeconds * 1000),
        violations,
        reason,
      };

      await client.set(
        `${this.keyPrefix}:${ip}`,
        JSON.stringify(blockInfo),
        { EX: durationSeconds }
      );

      // Track in blocked IPs set for admin listing
      await client.sAdd(`${this.keyPrefix}:blocked_ips`, ip);

      console.log(`IP Blocker - Blocked ${ip} for ${durationSeconds} seconds. Reason: ${reason}`);
    } catch (error) {
      console.error('IP Blocker - Error blocking IP:', error);
    }
  }

  /**
   * Manually block an IP (for admin use)
   */
  async manualBlock(ip: string, durationSeconds: number, reason: string): Promise<void> {
    await this.block(ip, durationSeconds, 0, `Manual block: ${reason}`);
  }

  /**
   * Unblock an IP address
   */
  async unblock(ip: string): Promise<boolean> {
    try {
      const client = await redisClient.getClient();
      
      await client.del(`${this.keyPrefix}:${ip}`);
      await client.sRem(`${this.keyPrefix}:blocked_ips`, ip);
      await client.del(`${this.violationPrefix}:${ip}`);

      console.log(`IP Blocker - Unblocked ${ip}`);
      return true;
    } catch (error) {
      console.error('IP Blocker - Error unblocking IP:', error);
      return false;
    }
  }

  /**
   * Get all currently blocked IPs
   */
  async getBlockedIPs(): Promise<{ ip: string; info: BlockInfo }[]> {
    try {
      const client = await redisClient.getClient();
      const blockedIPs = await client.sMembers(`${this.keyPrefix}:blocked_ips`);
      
      const results: { ip: string; info: BlockInfo }[] = [];

      for (const ip of blockedIPs) {
        const blockInfo = await this.isBlocked(ip);
        if (blockInfo) {
          results.push({ ip, info: blockInfo });
        }
      }

      return results;
    } catch (error) {
      console.error('IP Blocker - Error getting blocked IPs:', error);
      return [];
    }
  }

  /**
   * Get violation info for an IP
   */
  async getViolations(ip: string): Promise<ViolationInfo | null> {
    try {
      const client = await redisClient.getClient();
      const data = await client.get(`${this.violationPrefix}:${ip}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('IP Blocker - Error getting violations:', error);
      return null;
    }
  }

  /**
   * Get statistics about IP blocking
   */
  async getStats(): Promise<{
    totalBlocked: number;
    blockedIPs: { ip: string; info: BlockInfo }[];
  }> {
    const blockedIPs = await this.getBlockedIPs();
    return {
      totalBlocked: blockedIPs.length,
      blockedIPs,
    };
  }

  /**
   * Clear all violations for an IP (useful after successful auth)
   */
  async clearViolations(ip: string): Promise<void> {
    try {
      const client = await redisClient.getClient();
      await client.del(`${this.violationPrefix}:${ip}`);
      console.log(`IP Blocker - Cleared violations for ${ip}`);
    } catch (error) {
      console.error('IP Blocker - Error clearing violations:', error);
    }
  }
}

// Export singleton instance
export const ipBlockerService = IPBlockerService.getInstance();

/**
 * IP Blocker Middleware - checks if IP is blocked before processing request
 */
export function ipBlocker(options: IPBlockerOptions = {}) {
  const {
    whitelist = [],
    message = 'Your IP has been temporarily blocked due to suspicious activity.',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      // Check whitelist
      if (whitelist.includes(ip)) {
        return next();
      }

      // Check if IP is blocked
      const blockInfo = await ipBlockerService.isBlocked(ip);

      if (blockInfo) {
        const remainingTime = Math.ceil((blockInfo.expiresAt - Date.now()) / 1000);
        
        res.setHeader('X-Block-Reason', blockInfo.reason);
        res.setHeader('X-Block-Expires', Math.ceil(blockInfo.expiresAt / 1000));
        res.setHeader('Retry-After', remainingTime);

        return errorResponse(res, message, {
          blockedAt: new Date(blockInfo.blockedAt).toISOString(),
          expiresAt: new Date(blockInfo.expiresAt).toISOString(),
          remainingSeconds: remainingTime,
          violations: blockInfo.violations,
        }, 403);
      }

      next();
    } catch (error) {
      console.error('IP Blocker middleware error:', error);
      // Fail open - allow request if there's an error
      next();
    }
  };
}

/**
 * Higher-order function to wrap rate limiter with violation tracking
 */
export function withViolationTracking(
  rateLimiterMiddleware: (req: Request, res: Response, next: NextFunction) => void,
  options: IPBlockerOptions = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to detect rate limit responses
    res.json = function(body: any) {
      // Check if this is a rate limit error (429 status)
      if (res.statusCode === 429) {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const endpoint = `${req.method}:${req.path}`;
        
        // Record violation asynchronously
        ipBlockerService.recordViolation(ip, endpoint, options).catch(err => {
          console.error('Error recording violation:', err);
        });
      }
      
      return originalJson(body);
    };

    // Call the original rate limiter
    rateLimiterMiddleware(req, res, next);
  };
}
