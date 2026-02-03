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
  getIPStatsSchema,
  toggleBulkUploadPermissionSchema,
  getPendingBulkUploadsSchema,
  forceCommitBatchSchema,
  forceCancelBatchSchema,
  getBulkUploadStatsSchema
} from '../schemas/admin.schema';
import {
  getBlockedIPs,
  blockIP,
  unblockIP,
  getIPViolations,
  clearIPViolations,
  getIPStats,
  toggleBulkUploadPermission,
  getPendingBulkUploads,
  forceCommitBatch,
  forceCancelBatch,
  getBulkUploadStats
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

/**
 * Bulk Upload Governance Routes
 */

/**
 * @route   PATCH /api/admin/shops/:shopId/bulk-upload-permission
 * @desc    Toggle bulk upload permission for a shop
 * @access  Admin only
 * @body    { can_bulk_upload: boolean, reason?: string }
 */
router.patch(
  '/shops/:shopId/bulk-upload-permission',
  validateResource(toggleBulkUploadPermissionSchema),
  toggleBulkUploadPermission
);

/**
 * @route   GET /api/admin/bulk-uploads/pending
 * @desc    Get all pending bulk uploads across platform
 * @access  Admin only
 * @query   { page?: number, limit?: number, shop_id?: string }
 */
router.get(
  '/bulk-uploads/pending',
  validateResource(getPendingBulkUploadsSchema),
  getPendingBulkUploads
);

/**
 * @route   GET /api/admin/bulk-uploads/stats
 * @desc    Get bulk upload statistics
 * @access  Admin only
 * @query   { days?: number }
 */
router.get(
  '/bulk-uploads/stats',
  validateResource(getBulkUploadStatsSchema),
  getBulkUploadStats
);

/**
 * @route   POST /api/admin/bulk-uploads/:batchId/force-commit
 * @desc    Force commit a staging batch as admin
 * @access  Admin only
 * @body    { reason?: string }
 */
router.post(
  '/bulk-uploads/:batchId/force-commit',
  validateResource(forceCommitBatchSchema),
  forceCommitBatch
);

/**
 * @route   DELETE /api/admin/bulk-uploads/:batchId/force-cancel
 * @desc    Force cancel a staging batch as admin
 * @access  Admin only
 * @body    { reason?: string }
 */
router.delete(
  '/bulk-uploads/:batchId/force-cancel',
  validateResource(forceCancelBatchSchema),
  forceCancelBatch
);

export default router;
