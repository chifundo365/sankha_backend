import { Request, Response } from 'express';
import { ipBlockerService } from '../middleware/ipBlocker.middleware';
import { successResponse, errorResponse } from '../utils/response';
import prisma from '../prismaClient';

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

/**
 * Toggle bulk upload permission for a shop
 * PATCH /api/admin/shops/:shopId/bulk-upload-permission
 */
export const toggleBulkUploadPermission = async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { can_bulk_upload, reason } = req.body;

    // Check if shop exists
    const shop = await prisma.shops.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        can_bulk_upload: true,
        owner_id: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            email: true
          }
        }
      }
    });

    if (!shop) {
      return errorResponse(res, 'Shop not found', null, 404);
    }

    // Update shop permission
    const updatedShop = await prisma.shops.update({
      where: { id: shopId },
      data: { can_bulk_upload }
    });

    // Log the action (optional - could be enhanced with audit log table)
    console.log(`[ADMIN ACTION] Bulk upload permission ${can_bulk_upload ? 'enabled' : 'disabled'} for shop ${shop.name} (${shopId})`, {
      adminUser: req.user?.email,
      reason: reason || 'No reason provided'
    });

    return successResponse(res, `Bulk upload ${can_bulk_upload ? 'enabled' : 'disabled'} for shop`, {
      shop: {
        id: updatedShop.id,
        name: updatedShop.name,
        can_bulk_upload: updatedShop.can_bulk_upload,
        owner: shop.users ? `${shop.users.first_name} ${shop.users.last_name}` : 'Unknown'
      },
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Error toggling bulk upload permission:', error);
    return errorResponse(res, 'Failed to update bulk upload permission', null, 500);
  }
};

/**
 * Get all pending bulk uploads across platform
 * GET /api/admin/bulk-uploads/pending
 */
export const getPendingBulkUploads = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, shop_id } = req.query as any;

    const skip = (page - 1) * limit;

    const where: any = {
      status: 'STAGING'
    };

    if (shop_id) {
      where.shop_id = shop_id;
    }

    const [batches, total] = await Promise.all([
      prisma.bulk_uploads.findMany({
        where,
        include: {
          shops: {
            select: {
              id: true,
              name: true,
              owner_id: true,
              users: {
                select: {
                  first_name: true,
                  last_name: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.bulk_uploads.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return successResponse(res, 'Pending bulk uploads retrieved', {
      batches: batches.map(batch => ({
        id: batch.id,
        batchId: batch.batch_id,
        shopId: batch.shop_id,
        shopName: batch.shops.name,
        shopOwner: batch.shops.users ? {
          name: `${batch.shops.users.first_name} ${batch.shops.users.last_name}`,
          email: batch.shops.users.email
        } : null,
        totalRows: batch.total_rows,
        validRows: batch.successful,
        invalidRows: batch.failed,
        skippedRows: batch.skipped,
        status: batch.status,
        createdAt: batch.created_at
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error getting pending bulk uploads:', error);
    return errorResponse(res, 'Failed to retrieve pending bulk uploads', null, 500);
  }
};

/**
 * Force commit a staging batch as admin
 * POST /api/admin/bulk-uploads/:batchId/force-commit
 */
export const forceCommitBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { reason } = req.body;

    // Find the batch
    const batch = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId },
      include: {
        shops: {
          select: { id: true, name: true }
        }
      }
    });

    if (!batch) {
      return errorResponse(res, 'Batch not found', null, 404);
    }

    if (batch.status !== 'STAGING') {
      return errorResponse(res, `Batch status is ${batch.status}, cannot commit`, null, 400);
    }

    // Log admin action
    console.log(`[ADMIN FORCE COMMIT] Batch ${batchId} for shop ${batch.shops.name}`, {
      adminUser: req.user?.email,
      reason: reason || 'No reason provided',
      validRows: batch.successful
    });

    // Use the bulk upload staging service to commit
    const { bulkUploadStagingService } = await import('../services/bulkUploadStaging.service');
    const result = await bulkUploadStagingService.commitBatch(batch.id, batch.shop_id);

    return successResponse(res, 'Batch committed successfully by admin', {
      batchId: batch.batch_id,
      shopName: batch.shops.name,
      productsCreated: result.newProductsCreated,
      reason: reason || 'Admin force commit'
    });
  } catch (error) {
    console.error('Error force committing batch:', error);
    return errorResponse(res, 'Failed to commit batch', null, 500);
  }
};

/**
 * Force cancel a staging batch as admin
 * DELETE /api/admin/bulk-uploads/:batchId/force-cancel
 */
export const forceCancelBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { reason } = req.body;

    // Find the batch
    const batch = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId },
      include: {
        shops: {
          select: { id: true, name: true }
        }
      }
    });

    if (!batch) {
      return errorResponse(res, 'Batch not found', null, 404);
    }

    if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
      return errorResponse(res, `Batch is already ${batch.status}`, null, 400);
    }

    // Log admin action
    console.log(`[ADMIN FORCE CANCEL] Batch ${batchId} for shop ${batch.shops.name}`, {
      adminUser: req.user?.email,
      reason: reason || 'No reason provided'
    });

    // Cancel the batch
    await prisma.$transaction([
      // Delete staging rows
      prisma.bulk_upload_staging.deleteMany({
        where: { bulk_upload_id: batch.id }
      }),
      // Update batch status
      prisma.bulk_uploads.update({
        where: { id: batch.id },
        data: {
          status: 'CANCELLED'
        }
      })
    ]);

    return successResponse(res, 'Batch cancelled successfully by admin', {
      batchId: batch.batch_id,
      shopName: batch.shops.name,
      reason: reason || 'Admin force cancel'
    });
  } catch (error) {
    console.error('Error force canceling batch:', error);
    return errorResponse(res, 'Failed to cancel batch', null, 500);
  }
};

/**
 * Get bulk upload statistics
 * GET /api/admin/bulk-uploads/stats
 */
export const getBulkUploadStats = async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query as any;

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Aggregate statistics
    const [
      totalUploads,
      completedUploads,
      stagingUploads,
      cancelledUploads,
      failedUploads,
      recentUploads,
      topShops,
      totalProducts,
      totalValidRows,
      totalInvalidRows
    ] = await Promise.all([
      // Total uploads in period
      prisma.bulk_uploads.count({
        where: { created_at: { gte: since } }
      }),
      // Completed uploads
      prisma.bulk_uploads.count({
        where: {
          status: 'COMPLETED',
          created_at: { gte: since }
        }
      }),
      // Staging (pending) uploads
      prisma.bulk_uploads.count({
        where: { status: 'STAGING' }
      }),
      // Cancelled uploads
      prisma.bulk_uploads.count({
        where: {
          status: 'CANCELLED',
          created_at: { gte: since }
        }
      }),
      // Failed uploads
      prisma.bulk_uploads.count({
        where: {
          status: 'FAILED',
          created_at: { gte: since }
        }
      }),
      // Recent uploads
      prisma.bulk_uploads.findMany({
        where: { created_at: { gte: since } },
        include: {
          shops: {
            select: { name: true }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 10
      }),
      // Top shops by upload count
      prisma.bulk_uploads.groupBy({
        by: ['shop_id'],
        where: { created_at: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5
      }),
      // Total products created
      prisma.bulk_uploads.aggregate({
        where: {
          status: 'COMPLETED',
          created_at: { gte: since }
        },
        _sum: { successful: true }
      }),
      // Total valid rows
      prisma.bulk_uploads.aggregate({
        where: { created_at: { gte: since } },
        _sum: { successful: true }
      }),
      // Total invalid rows
      prisma.bulk_uploads.aggregate({
        where: { created_at: { gte: since } },
        _sum: { failed: true }
      })
    ]);

    // Get shop names for top shops
    const shopIds = topShops.map(s => s.shop_id);
    const shops = await prisma.shops.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, name: true }
    });

    const shopMap = Object.fromEntries(shops.map(s => [s.id, s.name]));

    return successResponse(res, 'Bulk upload statistics retrieved', {
      period: {
        days,
        since: since.toISOString()
      },
      overview: {
        totalUploads,
        completedUploads,
        stagingUploads,
        cancelledUploads,
        failedUploads,
        successRate: totalUploads > 0 
          ? ((completedUploads / totalUploads) * 100).toFixed(2) + '%'
          : '0%'
      },
      products: {
        totalCreated: totalProducts._sum?.successful || 0,
        totalValidRows: totalValidRows._sum?.successful || 0,
        totalInvalidRows: totalInvalidRows._sum?.failed || 0,
        validationRate: ((totalValidRows._sum?.successful || 0) + (totalInvalidRows._sum?.failed || 0)) > 0
          ? (((totalValidRows._sum?.successful || 0) / ((totalValidRows._sum?.successful || 0) + (totalInvalidRows._sum?.failed || 0))) * 100).toFixed(2) + '%'
          : '0%'
      },
      topShops: topShops.map(shop => ({
        shopId: shop.shop_id,
        shopName: shopMap[shop.shop_id] || 'Unknown',
        uploadCount: shop._count.id
      })),
      recentUploads: recentUploads.map(upload => ({
        batchId: upload.batch_id,
        shopName: upload.shops.name,
        status: upload.status,
        totalRows: upload.total_rows,
        validRows: upload.successful,
        invalidRows: upload.failed,
        createdAt: upload.created_at
      }))
    });
  } catch (error) {
    console.error('Error getting bulk upload stats:', error);
    return errorResponse(res, 'Failed to retrieve bulk upload statistics', null, 500);
  }
};
