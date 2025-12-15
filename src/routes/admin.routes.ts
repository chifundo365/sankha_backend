import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';
import validateResource from '../middleware/validateResource';
import {
  blockIPSchema,
  unblockIPSchema,
  getIPViolationsSchema,
  clearIPViolationsSchema,
  getBlockedIPsSchema,
  getIPStatsSchema
} from '../schemas/admin.schema';
import {
  getBlockedIPs,
  blockIP,
  unblockIP,
  getIPViolations,
  clearIPViolations,
  getIPStats,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(protect);
router.use(authorize('ADMIN'));

/**
 * @route   GET /api/admin/blocked-ips
 * @desc    Get all currently blocked IPs
 * @access  Admin only
 */
router.get('/blocked-ips', validateResource(getBlockedIPsSchema), getBlockedIPs);

/**
 * @route   POST /api/admin/blocked-ips
 * @desc    Manually block an IP address
 * @access  Admin only
 * @body    { ip: string, durationMinutes?: number, reason?: string }
 */
router.post('/blocked-ips', validateResource(blockIPSchema), blockIP);

/**
 * @route   DELETE /api/admin/blocked-ips/:ip
 * @desc    Unblock an IP address
 * @access  Admin only
 */
router.delete('/blocked-ips/:ip', validateResource(unblockIPSchema), unblockIP);

/**
 * @route   GET /api/admin/violations/:ip
 * @desc    Get violation info for a specific IP
 * @access  Admin only
 */
router.get('/violations/:ip', validateResource(getIPViolationsSchema), getIPViolations);

/**
 * @route   DELETE /api/admin/violations/:ip
 * @desc    Clear violations for a specific IP
 * @access  Admin only
 */
router.delete('/violations/:ip', validateResource(clearIPViolationsSchema), clearIPViolations);

/**
 * @route   GET /api/admin/ip-stats
 * @desc    Get IP blocking statistics
 * @access  Admin only
 */
router.get('/ip-stats', validateResource(getIPStatsSchema), getIPStats);

export default router;
