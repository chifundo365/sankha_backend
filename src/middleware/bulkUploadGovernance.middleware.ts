/**
 * Bulk Upload Governance Middleware v4.0
 * ======================================
 * Enforces shop-level permissions and ownership verification for bulk uploads.
 * 
 * Checks:
 * 1. Shop has `can_bulk_upload` flag enabled
 * 2. Authenticated user owns the shop they're uploading to
 * 3. Shop is in active status
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../prismaClient';
import { errorResponse } from '../utils/response';

// ============================================================================
// TYPES
// ============================================================================

interface ShopVerificationResult {
  allowed: boolean;
  reason?: string;
  reasonChichewa?: string;
  shopId?: string;
  shopName?: string;
}

// ============================================================================
// ERROR MESSAGES (English + Chichewa)
// ============================================================================

const ERRORS = {
  SHOP_NOT_FOUND: {
    en: 'Shop not found.',
    ch: 'Sitolo sinapezeke.'
  },
  NOT_AUTHORIZED: {
    en: 'Your shop is not authorized for bulk uploads.',
    ch: 'Sitolo yanu ilibe chilolezo choika katundu wambiri nthawi imodzi.'
  },
  SHOP_INACTIVE: {
    en: 'Your shop is currently inactive. Contact support to reactivate.',
    ch: 'Sitolo yanu inali itatsekeredwa. Lumikizanani ndi thandizo kuti ikhale yotseguka.'
  },
  NOT_OWNER: {
    en: 'You do not have permission to upload to this shop.',
    ch: 'Mulibe chilolezo choyikira katundu mu sitolo iyi.'
  },
  BATCH_NOT_FOUND: {
    en: 'Upload batch not found.',
    ch: 'Batch yomwe munaika sinapezeke.'
  },
  BATCH_WRONG_SHOP: {
    en: 'This batch does not belong to your shop.',
    ch: 'Batch iyi si ya sitolo yanu.'
  },
  MISSING_SHOP_ID: {
    en: 'Shop ID is required.',
    ch: 'Shop ID ndiyofunikira.'
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format error message with both languages
 */
function formatError(error: { en: string; ch: string }): string {
  return `${error.en} / ${error.ch}`;
}

/**
 * Get shop ID from various sources in the request
 */
function extractShopId(req: Request): string | undefined {
  // Priority: body > params > query
  return req.body?.shopId || req.params?.shopId || req.query?.shopId as string;
}

/**
 * Verify shop ownership and permissions
 */
async function verifyShopAccess(
  userId: string,
  shopId: string
): Promise<ShopVerificationResult> {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      name: true,
      owner_id: true,
      can_bulk_upload: true,
      is_verified: true
    }
  });

  if (!shop) {
    return {
      allowed: false,
      reason: ERRORS.SHOP_NOT_FOUND.en,
      reasonChichewa: ERRORS.SHOP_NOT_FOUND.ch
    };
  }

  // Check ownership
  if (shop.owner_id !== userId) {
    return {
      allowed: false,
      reason: ERRORS.NOT_OWNER.en,
      reasonChichewa: ERRORS.NOT_OWNER.ch
    };
  }

  // Check bulk upload permission
  if (!shop.can_bulk_upload) {
    return {
      allowed: false,
      reason: ERRORS.NOT_AUTHORIZED.en,
      reasonChichewa: ERRORS.NOT_AUTHORIZED.ch
    };
  }

  return {
    allowed: true,
    shopId: shop.id,
    shopName: shop.name
  };
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Middleware: Verify shop can perform bulk upload
 * 
 * Checks:
 * - User is authenticated
 * - Shop exists and user owns it
 * - Shop has can_bulk_upload = true
 * 
 * Attaches: req.shop = { id, name }
 */
export const canBulkUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      errorResponse(res, 'Authentication required', 401);
      return;
    }

    // Get shop ID - for upload, it comes from the user's shop
    let shopId = extractShopId(req);

    // If no shopId provided, try to get user's primary shop
    if (!shopId) {
      const userShop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true }
      });

      if (!userShop) {
        errorResponse(res, formatError(ERRORS.SHOP_NOT_FOUND), 404);
        return;
      }

      shopId = userShop.id;
    }

    // Verify access
    const verification = await verifyShopAccess(userId, shopId);

    if (!verification.allowed) {
      errorResponse(
        res,
        `${verification.reason} / ${verification.reasonChichewa}`,
        403
      );
      return;
    }

    // Attach shop info to request for downstream use
    (req as any).shop = {
      id: verification.shopId,
      name: verification.shopName
    };

    next();
  } catch (error) {
    console.error('Bulk upload governance error:', error);
    errorResponse(res, 'Failed to verify bulk upload permissions', 500);
  }
};

/**
 * Middleware: Verify batch belongs to user's shop
 * 
 * Checks:
 * - batchId exists in params
 * - Batch exists and belongs to user's shop
 * 
 * Attaches: req.batch = { id, shopId, status }
 */
export const verifyBatchOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const batchId = req.params.batchId;

    if (!userId) {
      errorResponse(res, 'Authentication required', 401);
      return;
    }

    if (!batchId) {
      errorResponse(res, 'Batch ID is required', 400);
      return;
    }

    // Find the batch and verify ownership
    const bulkUpload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId },
      include: {
        shops: {
          select: {
            id: true,
            name: true,
            owner_id: true,
            can_bulk_upload: true
          }
        }
      }
    });

    if (!bulkUpload) {
      errorResponse(res, formatError(ERRORS.BATCH_NOT_FOUND), 404);
      return;
    }

    // Verify shop ownership
    if (bulkUpload.shops.owner_id !== userId) {
      // Check if user is admin (admins can access any batch)
      if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        errorResponse(res, formatError(ERRORS.BATCH_WRONG_SHOP), 403);
        return;
      }
    }

    // Attach batch info to request
    (req as any).batch = {
      id: bulkUpload.id,
      batchId: bulkUpload.batch_id,
      shopId: bulkUpload.shop_id,
      shopName: bulkUpload.shops.name,
      status: bulkUpload.status,
      totalRows: bulkUpload.total_rows
    };

    (req as any).shop = {
      id: bulkUpload.shops.id,
      name: bulkUpload.shops.name
    };

    next();
  } catch (error) {
    console.error('Batch ownership verification error:', error);
    errorResponse(res, 'Failed to verify batch ownership', 500);
  }
};

/**
 * Middleware: Admin-only bulk upload access
 * 
 * Allows admins to access any batch regardless of ownership.
 * Still requires the batch to exist.
 */
export const adminBulkUploadAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      errorResponse(res, 'Admin access required', 403);
      return;
    }

    const batchId = req.params.batchId;
    const shopId = req.params.shopId || req.query.shopId as string;

    if (batchId) {
      const bulkUpload = await prisma.bulk_uploads.findFirst({
        where: { batch_id: batchId },
        include: {
          shops: { select: { id: true, name: true } }
        }
      });

      if (!bulkUpload) {
        errorResponse(res, formatError(ERRORS.BATCH_NOT_FOUND), 404);
        return;
      }

      (req as any).batch = {
        id: bulkUpload.id,
        batchId: bulkUpload.batch_id,
        shopId: bulkUpload.shop_id,
        shopName: bulkUpload.shops.name,
        status: bulkUpload.status,
        totalRows: bulkUpload.total_rows
      };

      (req as any).shop = {
        id: bulkUpload.shops.id,
        name: bulkUpload.shops.name
      };
    } else if (shopId) {
      const shop = await prisma.shops.findUnique({
        where: { id: shopId },
        select: { id: true, name: true }
      });

      if (!shop) {
        errorResponse(res, formatError(ERRORS.SHOP_NOT_FOUND), 404);
        return;
      }

      (req as any).shop = { id: shop.id, name: shop.name };
    }

    next();
  } catch (error) {
    console.error('Admin bulk upload access error:', error);
    errorResponse(res, 'Failed to verify admin access', 500);
  }
};

/**
 * Middleware: Check if shop has pending batches limit
 */
export const checkPendingBatchLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const shopId = (req as any).shop?.id;
    const MAX_PENDING_BATCHES = 3;

    if (!shopId) {
      errorResponse(res, formatError(ERRORS.MISSING_SHOP_ID), 400);
      return;
    }

    const pendingCount = await prisma.bulk_uploads.count({
      where: {
        shop_id: shopId,
        status: 'STAGING'
      }
    });

    if (pendingCount >= MAX_PENDING_BATCHES) {
      errorResponse(
        res,
        `You have ${pendingCount} pending uploads. Please commit or cancel them before starting a new one. / Muli ndi ma upload ${pendingCount} omwe sakumalitsidwa. Chonde amalitseni asanayambe ena.`,
        429
      );
      return;
    }

    next();
  } catch (error) {
    console.error('Pending batch limit check error:', error);
    errorResponse(res, 'Failed to check pending batch limit', 500);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  canBulkUpload,
  verifyBatchOwnership,
  adminBulkUploadAccess,
  checkPendingBatchLimit
};
