/**
 * Seller Inventory Controller v4.0
 * =================================
 * Handles seller-facing inventory management endpoints.
 * Includes "Needs Attention" dashboard API and correction file downloads.
 */

import { Request, Response } from 'express';
import prisma from '../prismaClient';
import { bulkUploadCorrectionService } from '../services/bulkUploadCorrection.service';
import { generateDashboardNotification } from '../utils/errorMessages';
import { techSpecValidator } from '../services/techSpecValidator.service';

// ============================================================================
// TYPES
// ============================================================================

// Use Request directly, user is attached by protect middleware
type AuthenticatedRequest = Request;

interface PendingActionsResponse {
  summary: {
    totalPending: number;
    needsSpecs: number;
    needsImages: number;
    broken: number;
    live: number;
    paused: number;
  };
  notifications: Array<{
    status: string;
    count: number;
    title: string;
    description: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
    link: string;
  }>;
  recentUploads: Array<{
    id: string;
    fileName: string;
    uploadedAt: Date;
    totalRows: number;
    successful: number;
    failed: number;
    needsSpecs: number;
    needsImages: number;
    hasCorrectionFile: boolean;
  }>;
}

// ============================================================================
// CONTROLLER
// ============================================================================

export const sellerInventoryController = {
  /**
   * GET /api/seller/inventory/pending-actions
   * Dashboard endpoint showing items needing seller attention
   */
  async getPendingActions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const language = (req.query.lang as 'en' | 'ny') || 'en';

      // Get seller's shop
      const shop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true }
      });

      if (!shop) {
        return res.status(404).json({ error: 'Shop not found' });
      }

      const shopId = shop.id;

      // Get counts by listing status
      const statusCounts = await prisma.shop_products.groupBy({
        by: ['listing_status'],
        where: { shop_id: shopId },
        _count: true
      });

      // Build summary
      const summary = {
        totalPending: 0,
        needsSpecs: 0,
        needsImages: 0,
        broken: 0,
        live: 0,
        paused: 0
      };

      for (const item of statusCounts) {
        const status = item.listing_status || 'NEEDS_IMAGES';
        const count = item._count;

        switch (status) {
          case 'NEEDS_SPECS':
            summary.needsSpecs = count;
            summary.totalPending += count;
            break;
          case 'NEEDS_IMAGES':
            summary.needsImages = count;
            summary.totalPending += count;
            break;
          case 'BROKEN':
            summary.broken = count;
            summary.totalPending += count;
            break;
          case 'LIVE':
            summary.live = count;
            break;
          case 'PAUSED':
            summary.paused = count;
            break;
        }
      }

      // Get broken count from staging table (failed uploads)
      const brokenStagingCount = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT batch_id) as count
        FROM bulk_upload_staging
        WHERE shop_id = ${shopId}::uuid
        AND validation_status = 'INVALID'
      `;
      
      const stagingBroken = Number(brokenStagingCount[0]?.count || 0);

      // Build notifications (prioritized)
      const notifications: PendingActionsResponse['notifications'] = [];

      if (summary.broken > 0 || stagingBroken > 0) {
        const brokenTotal = summary.broken + stagingBroken;
        const notif = generateDashboardNotification('BROKEN', brokenTotal, language);
        notifications.push({
          status: 'BROKEN',
          count: brokenTotal,
          ...notif,
          priority: 'high',
          link: '/seller/uploads/corrections'
        });
      }

      if (summary.needsSpecs > 0) {
        const notif = generateDashboardNotification('NEEDS_SPECS', summary.needsSpecs, language);
        notifications.push({
          status: 'NEEDS_SPECS',
          count: summary.needsSpecs,
          ...notif,
          priority: 'high',
          link: '/seller/products/needs-specs'
        });
      }

      if (summary.needsImages > 0) {
        const notif = generateDashboardNotification('NEEDS_IMAGES', summary.needsImages, language);
        notifications.push({
          status: 'NEEDS_IMAGES',
          count: summary.needsImages,
          ...notif,
          priority: 'medium',
          link: '/seller/products/needs-images'
        });
      }

      // Get recent uploads with correction info
      const recentUploads = await prisma.bulk_uploads.findMany({
        where: { shop_id: shopId },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          id: true,
          batch_id: true,
          file_name: true,
          created_at: true,
          total_rows: true,
          successful: true,
          failed: true,
          needs_specs: true,
          needs_images: true,
          status: true
        }
      });

      const uploadsWithCorrections = recentUploads.map((upload: typeof recentUploads[number]) => ({
        id: upload.id,
        batchId: upload.batch_id,
        fileName: upload.file_name,
        uploadedAt: upload.created_at,
        totalRows: upload.total_rows,
        successful: upload.successful || 0,
        failed: upload.failed || 0,
        needsSpecs: upload.needs_specs || 0,
        needsImages: upload.needs_images || 0,
        hasCorrectionFile: (upload.failed || 0) > 0
      }));

      const response: PendingActionsResponse = {
        summary,
        notifications,
        recentUploads: uploadsWithCorrections
      };

      return res.json(response);
    } catch (error) {
      console.error('Error fetching pending actions:', error);
      return res.status(500).json({ error: 'Failed to fetch pending actions' });
    }
  },

  /**
   * GET /api/seller/inventory/needs-specs
   * Get products that need specifications
   */
  async getProductsNeedingSpecs(req: AuthenticatedRequest, res: Response) {
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

      const [products, totalCount] = await Promise.all([
        prisma.shop_products.findMany({
          where: {
            shop_id: shop.id,
            listing_status: 'NEEDS_SPECS'
          },
          include: {
            products: {
              select: {
                name: true,
                brand: true,
                categories: {
                  select: { name: true }
                }
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
            listing_status: 'NEEDS_SPECS'
          }
        })
      ]);
      
      return res.json({
        products: products.map((p: typeof products[number]) => ({
          id: p.id,
          product_name: p.products.name,
          brand: p.products.brand,
          category: p.products.categories?.name,
          sku: p.sku,
          base_price: p.base_price,
          display_price: p.price,
          stock_quantity: p.stock_quantity,
          condition: p.condition,
          specs: p.specs,
          variant_values: p.variant_values,
          listing_status: p.listing_status,
          created_at: p.created_at
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error fetching products needing specs:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
  },

  /**
   * GET /api/seller/inventory/needs-images
   * Get products that need images
   */
  async getProductsNeedingImages(req: AuthenticatedRequest, res: Response) {
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

      const [products, totalCount] = await Promise.all([
        prisma.shop_products.findMany({
          where: {
            shop_id: shop.id,
            listing_status: 'NEEDS_IMAGES'
          },
          include: {
            products: {
              select: {
                name: true,
                brand: true,
                categories: {
                  select: { name: true }
                }
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
            listing_status: 'NEEDS_IMAGES'
          }
        })
      ]);
      
      return res.json({
        products: products.map((p: typeof products[number]) => ({
          id: p.id,
          product_name: p.products.name,
          brand: p.products.brand,
          category: p.products.categories?.name,
          sku: p.sku,
          base_price: p.base_price,
          display_price: p.price,
          stock_quantity: p.stock_quantity,
          condition: p.condition,
          listing_status: p.listing_status,
          created_at: p.created_at
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error fetching products needing images:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
  },

  /**
   * GET /api/seller/uploads/:batchId/corrections
   * Download correction CSV for a failed batch
   */
  async downloadCorrectionFile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { batchId } = req.params;
      const format = (req.query.format as 'xlsx' | 'csv') || 'xlsx';
      const includeChichewa = req.query.chichewa !== 'false';

      // Verify ownership
      const upload = await prisma.bulk_uploads.findFirst({
        where: { batch_id: batchId },
        include: {
          shops: {
            select: { owner_id: true }
          }
        }
      });

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      if (upload.shops.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this upload' });
      }

      // Generate correction file
      const { buffer, filename, summary } = await bulkUploadCorrectionService.generateCorrectionFile(
        batchId,
        format,
        includeChichewa
      );

      // Track download
      await bulkUploadCorrectionService.markCorrectionDownloaded(batchId, userId);

      // Set headers and send file
      const contentType = format === 'csv' 
        ? 'text/csv' 
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Correction-Summary', JSON.stringify(summary));

      return res.send(buffer);
    } catch (error) {
      console.error('Error generating correction file:', error);
      
      if (error instanceof Error && error.message === 'No invalid rows found for this batch') {
        return res.status(404).json({ error: 'No corrections needed for this batch' });
      }
      
      return res.status(500).json({ error: 'Failed to generate correction file' });
    }
  },

  /**
   * GET /api/seller/uploads/:batchId/corrections/preview
   * Preview correction data before download
   */
  async previewCorrections(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { batchId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // Verify ownership
      const upload = await prisma.bulk_uploads.findFirst({
        where: { batch_id: batchId },
        include: {
          shops: {
            select: { owner_id: true }
          }
        }
      });

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      if (upload.shops.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this upload' });
      }

      const preview = await bulkUploadCorrectionService.getCorrectionPreview(batchId, page, limit);
      return res.json(preview);
    } catch (error) {
      console.error('Error previewing corrections:', error);
      return res.status(500).json({ error: 'Failed to preview corrections' });
    }
  },

  /**
   * PATCH /api/seller/products/:shopProductId/specs
   * Update specs for a product (move from NEEDS_SPECS to NEEDS_IMAGES)
   */
  async updateProductSpecs(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { shopProductId } = req.params;
      const { specs } = req.body;

      if (!specs || typeof specs !== 'object') {
        return res.status(400).json({ error: 'Specs must be provided as an object' });
      }

      // Verify ownership
      const shopProduct = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        include: {
          shops: {
            select: { owner_id: true }
          }
        }
      });

      if (!shopProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (shopProduct.shops.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to update this product' });
      }

      // Get product with category for validation
      const productWithCategory = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        include: {
          products: {
            include: {
              categories: true
            }
          }
        }
      });

      // Merge existing specs with new ones
      const existingSpecs = (shopProduct.variant_values || {}) as Record<string, string>;
      const mergedSpecs = { ...existingSpecs, ...specs };

      // Validate updated specs
      const specResult = await techSpecValidator.validateSpecs(
        productWithCategory?.products.category_id || null,
        productWithCategory?.products.categories?.name,
        mergedSpecs
      );

      // Determine new status
      let newStatus = shopProduct.listing_status;
      if (specResult.isTechCategory) {
        if (specResult.missingRequired.length === 0) {
          newStatus = 'NEEDS_IMAGES';
        } else {
          newStatus = 'NEEDS_SPECS';
        }
      }

      // Update shop product
      await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          specs: specResult.normalizedValues,
          variant_values: specResult.normalizedValues,
          listing_status: newStatus
        }
      });
      
      return res.json({
        success: true,
        newStatus,
        missingSpecs: specResult.missingRequired.length > 0 ? specResult.missingRequired : undefined,
        message: newStatus === 'NEEDS_IMAGES' 
          ? 'Specs updated! Now add images to make this product live.'
          : `Still missing: ${specResult.missingRequired.join(', ')}`
      });
    } catch (error) {
      console.error('Error updating product specs:', error);
      return res.status(500).json({ error: 'Failed to update specs' });
    }
  },

  /**
   * GET /api/seller/categories/:categoryName/required-specs
   * Get required specs for a category (helper for UI)
   */
  async getRequiredSpecs(req: AuthenticatedRequest, res: Response) {
    try {
      const { categoryName } = req.params;
      
      const rule = await techSpecValidator.getRuleForCategory(categoryName);
      
      if (!rule) {
        return res.json({
          categoryName,
          isTechCategory: false,
          requiredSpecs: [],
          message: 'This category does not require technical specifications'
        });
      }

      return res.json({
        categoryName: rule.categoryName,
        isTechCategory: true,
        requiredSpecs: rule.requiredSpecs,
        optionalSpecs: rule.optionalSpecs,
        message: `Required: ${rule.requiredSpecs.join(', ')}`
      });
    } catch (error) {
      console.error('Error fetching required specs:', error);
      return res.status(500).json({ error: 'Failed to fetch category specs' });
    }
  }
};

export default sellerInventoryController;
