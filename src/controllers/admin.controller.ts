import { Request, Response } from 'express';
import { ipBlockerService } from '../middleware/ipBlocker.middleware';
import { successResponse, errorResponse } from '../utils/response';

/**
 * Get all blocked IPs
 * GET /api/admin/blocked-ips
 */
export const getBlockedIPs = async (_req: Request, res: Response) => {
  try {
    const stats = await ipBlockerService.getStats();
    
    const formattedIPs = stats.blockedIPs.map(({ ip, info }) => ({
      ip,
      blockedAt: new Date(info.blockedAt).toISOString(),
      expiresAt: new Date(info.expiresAt).toISOString(),
      remainingSeconds: Math.max(0, Math.ceil((info.expiresAt - Date.now()) / 1000)),
      violations: info.violations,
      reason: info.reason,
    }));

    return successResponse(res, 'Blocked IPs retrieved successfully', {
      totalBlocked: stats.totalBlocked,
      blockedIPs: formattedIPs,
    });
  } catch (error) {
    console.error('Error getting blocked IPs:', error);
    return errorResponse(res, 'Failed to retrieve blocked IPs', null, 500);
  }
};

/**
 * Block an IP address manually
 * POST /api/admin/blocked-ips
 * Body: { ip: string, durationMinutes: number, reason: string }
 */
export const blockIP = async (req: Request, res: Response) => {
  try {
    const { ip, durationMinutes = 60, reason = 'Manual block by admin' } = req.body;

    if (!ip) {
      return errorResponse(res, 'IP address is required', null, 400);
    }

    // Validate IP format (basic check)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([a-fA-F0-9:]+)$/;
    if (!ipRegex.test(ip)) {
      return errorResponse(res, 'Invalid IP address format', null, 400);
    }

    const durationSeconds = durationMinutes * 60;
    await ipBlockerService.manualBlock(ip, durationSeconds, reason);

    return successResponse(res, `IP ${ip} blocked successfully`, {
      ip,
      durationMinutes,
      durationSeconds,
      reason,
      expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    }, 201);
  } catch (error) {
    console.error('Error blocking IP:', error);
    return errorResponse(res, 'Failed to block IP', null, 500);
  }
};

/**
 * Unblock an IP address
 * DELETE /api/admin/blocked-ips/:ip
 */
export const unblockIP = async (req: Request, res: Response) => {
  try {
    const { ip } = req.params;

    if (!ip) {
      return errorResponse(res, 'IP address is required', null, 400);
    }

    // Check if IP is actually blocked
    const blockInfo = await ipBlockerService.isBlocked(ip);
    if (!blockInfo) {
      return errorResponse(res, 'IP is not currently blocked', null, 404);
    }

    const success = await ipBlockerService.unblock(ip);

    if (success) {
      return successResponse(res, `IP ${ip} unblocked successfully`, { ip });
    } else {
      return errorResponse(res, 'Failed to unblock IP', null, 500);
    }
  } catch (error) {
    console.error('Error unblocking IP:', error);
    return errorResponse(res, 'Failed to unblock IP', null, 500);
  }
};

/**
 * Get violation info for a specific IP
 * GET /api/admin/violations/:ip
 */
export const getIPViolations = async (req: Request, res: Response) => {
  try {
    const { ip } = req.params;

    if (!ip) {
      return errorResponse(res, 'IP address is required', null, 400);
    }

    const violations = await ipBlockerService.getViolations(ip);
    const blockInfo = await ipBlockerService.isBlocked(ip);

    if (!violations && !blockInfo) {
      return successResponse(res, 'No violations found for this IP', {
        ip,
        violations: null,
        isBlocked: false,
      });
    }

    return successResponse(res, 'Violation info retrieved successfully', {
      ip,
      violations: violations ? {
        count: violations.count,
        lastViolation: new Date(violations.lastViolation).toISOString(),
        endpoints: violations.endpoints,
      } : null,
      isBlocked: !!blockInfo,
      blockInfo: blockInfo ? {
        blockedAt: new Date(blockInfo.blockedAt).toISOString(),
        expiresAt: new Date(blockInfo.expiresAt).toISOString(),
        remainingSeconds: Math.max(0, Math.ceil((blockInfo.expiresAt - Date.now()) / 1000)),
        reason: blockInfo.reason,
      } : null,
    });
  } catch (error) {
    console.error('Error getting IP violations:', error);
    return errorResponse(res, 'Failed to retrieve violation info', null, 500);
  }
};

/**
 * Clear violations for a specific IP (without unblocking)
 * DELETE /api/admin/violations/:ip
 */
export const clearIPViolations = async (req: Request, res: Response) => {
  try {
    const { ip } = req.params;

    if (!ip) {
      return errorResponse(res, 'IP address is required', null, 400);
    }

    await ipBlockerService.clearViolations(ip);

    return successResponse(res, `Violations cleared for IP ${ip}`, { ip });
  } catch (error) {
    console.error('Error clearing violations:', error);
    return errorResponse(res, 'Failed to clear violations', null, 500);
  }
};

/**
 * Get IP blocking statistics and summary
 * GET /api/admin/ip-stats
 */
export const getIPStats = async (_req: Request, res: Response) => {
  try {
    const stats = await ipBlockerService.getStats();

    return successResponse(res, 'IP blocking statistics retrieved', {
      totalCurrentlyBlocked: stats.totalBlocked,
      blockedIPs: stats.blockedIPs.map(({ ip, info }) => ({
        ip,
        violations: info.violations,
        expiresIn: Math.max(0, Math.ceil((info.expiresAt - Date.now()) / 1000)),
      })),
    });
  } catch (error) {
    console.error('Error getting IP stats:', error);
    return errorResponse(res, 'Failed to retrieve IP statistics', null, 500);
  }
};
