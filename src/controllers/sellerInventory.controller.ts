/**
 * Seller Inventory Controller (Stub)
 * ===================================
 * NOTE: Full v4.0 staging features require schema updates.
 * These endpoints return "not implemented" until schema migration is done.
 * 
 * Required schema updates for full implementation:
 * - bulk_uploads: add batch_id, template_type, needs_specs, needs_images
 * - shop_products: add variant_values field  
 * - listing_status enum: add NEEDS_SPECS, BROKEN values
 * - upload_status enum: add STAGING, CANCELLED values
 */

import { Request, Response } from 'express';
import prisma from '../prismaClient';
import { listing_status } from '../../generated/prisma';

const NOT_IMPLEMENTED_MSG = 'This v4.0 feature requires a schema migration. Use the basic bulk upload endpoint at /api/shops/:shopId/products/bulk instead.';

// ============================================================================
// CONTROLLER
// ============================================================================

export const sellerInventoryController = {
  /**
   * GET /api/seller/inventory/pending-actions
   * Dashboard endpoint showing items needing seller attention
   */
  async getPendingActions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get seller's shop
      const shop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true }
      });

      if (!shop) {
        return res.status(404).json({ error: 'Shop not found' });
      }

      // Get counts by listing status
      const statusCounts = await prisma.shop_products.groupBy({
        by: ['listing_status'],
        where: { shop_id: shop.id },
        _count: true
      });

      // Build summary with available statuses
      const summary = {
        totalPending: 0,
        needsImages: 0,
        pendingReview: 0,
        live: 0,
        paused: 0,
        rejected: 0
      };

      for (const item of statusCounts) {
        const status = item.listing_status || 'NEEDS_IMAGES';
        const count = item._count;

        switch (status) {
          case 'NEEDS_IMAGES':
            summary.needsImages = count;
            summary.totalPending += count;
            break;
          case 'PENDING_REVIEW':
            summary.pendingReview = count;
            summary.totalPending += count;
            break;
          case 'LIVE':
            summary.live = count;
            break;
          case 'PAUSED':
            summary.paused = count;
            break;
          case 'REJECTED':
            summary.rejected = count;
            break;
        }
      }

      // Get recent uploads
      const recentUploads = await prisma.bulk_uploads.findMany({
        where: { shop_id: shop.id },
        orderBy: { created_at: 'desc' },
        take: 5
      });

      return res.json({
        success: true,
        data: {
          summary,
          notifications: [
            ...(summary.needsImages > 0 ? [{
              status: 'NEEDS_IMAGES',
              count: summary.needsImages,
              title: 'Products need images',
              description: `${summary.needsImages} products are waiting for images`,
              action: 'Add images',
              priority: 'high' as const,
              link: '/seller/inventory/needs-images'
            }] : []),
            ...(summary.pendingReview > 0 ? [{
              status: 'PENDING_REVIEW',
              count: summary.pendingReview,
              title: 'Products pending review',
              description: `${summary.pendingReview} products are being reviewed`,
              action: 'View status',
              priority: 'medium' as const,
              link: '/seller/inventory/pending-review'
            }] : [])
          ],
          recentUploads: recentUploads.map(u => ({
            id: u.id,
            fileName: u.file_name,
            uploadedAt: u.created_at,
            totalRows: u.total_rows,
            successful: u.successful,
            failed: u.failed,
            skipped: u.skipped,
            status: u.status
          }))
        }
      });
    } catch (error) {
      console.error('getPendingActions error:', error);
      return res.status(500).json({ error: 'Failed to get pending actions' });
    }
  },

  /**
   * GET /api/seller/inventory/needs-specs
   * Get products that need specifications (v4.0 staging feature)
   */
  async getProductsNeedingSpecs(req: Request, res: Response) {
    // NEEDS_SPECS status doesn't exist in current schema
    return res.status(501).json({ 
      error: NOT_IMPLEMENTED_MSG,
      message: 'The NEEDS_SPECS listing status requires a schema migration.'
    });
  },

  /**
   * GET /api/seller/inventory/needs-images
   * Get products that need images
   */
  async getProductsNeedingImages(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Get seller's shop
      const shop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true }
      });

      if (!shop) {
        return res.status(404).json({ error: 'Shop not found' });
      }

      const [products, total] = await Promise.all([
        prisma.shop_products.findMany({
          where: {
            shop_id: shop.id,
            listing_status: 'NEEDS_IMAGES' as listing_status
          },
          include: {
            products: {
              select: {
                name: true,
                brand: true,
                categories: { select: { name: true } }
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit
        }),
        prisma.shop_products.count({
          where: {
            shop_id: shop.id,
            listing_status: 'NEEDS_IMAGES' as listing_status
          }
        })
      ]);

      return res.json({
        success: true,
        data: {
          products: products.map(p => ({
            id: p.id,
            productName: p.products.name,
            brand: p.products.brand,
            category: p.products.categories?.name,
            sku: p.sku,
            basePrice: p.base_price,
            displayPrice: p.price,
            stockQuantity: p.stock_quantity,
            condition: p.condition,
            specs: p.specs,
            images: p.images,
            listingStatus: p.listing_status
          })),
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('getProductsNeedingImages error:', error);
      return res.status(500).json({ error: 'Failed to get products' });
    }
  },

  /**
   * GET /api/seller/uploads/:batchId/corrections
   * Download correction file (v4.0 staging feature)
   */
  async downloadCorrectionFile(req: Request, res: Response) {
    return res.status(501).json({ 
      error: NOT_IMPLEMENTED_MSG,
      message: 'Correction files require the v4.0 staging pipeline.'
    });
  },

  /**
   * GET /api/seller/uploads/:batchId/corrections/preview
   * Preview correction file content (v4.0 staging feature)
   */
  async previewCorrectionFile(req: Request, res: Response) {
    return res.status(501).json({ 
      error: NOT_IMPLEMENTED_MSG,
      message: 'Correction file preview requires the v4.0 staging pipeline.'
    });
  },

  /**
   * PUT /api/seller/products/:shopProductId/specs
   * Update product specifications
   */
  async updateProductSpecs(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { shopProductId } = req.params;
      const { specs } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!specs || typeof specs !== 'object') {
        return res.status(400).json({ error: 'Invalid specs data' });
      }

      // Check ownership
      const shopProduct = await prisma.shop_products.findFirst({
        where: { id: shopProductId },
        include: {
          shops: { select: { owner_id: true } }
        }
      });

      if (!shopProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (shopProduct.shops.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Update specs
      const updated = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          specs,
          updated_at: new Date()
        }
      });

      return res.json({
        success: true,
        data: {
          id: updated.id,
          specs: updated.specs,
          listingStatus: updated.listing_status
        }
      });
    } catch (error) {
      console.error('updateProductSpecs error:', error);
      return res.status(500).json({ error: 'Failed to update specs' });
    }
  }
};
