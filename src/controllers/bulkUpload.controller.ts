import { Request, Response } from 'express';
import prisma from '../prismaClient';
import { errorResponse, successResponse } from '../utils/response';
import { bulkUploadService } from '../services/bulkUpload.service';
import { bulkUploadStagingService } from '../services/bulkUploadStaging.service';
import { bulkUploadCorrectionService } from '../services/bulkUploadCorrection.service';
import { CloudinaryService } from '../services/cloudinary.service';

const MAX_UPLOAD_ROWS = 200;

/**
 * Helper function to check if user owns the shop
 */
const checkShopOwnership = async (shopId: string, userId: string, userRole: string) => {
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    return true;
  }

  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { owner_id: true }
  });

  return shop?.owner_id === userId;
};

export const bulkUploadController = {
  /**
   * Download Excel template for bulk upload
   * GET /api/shops/:shopId/products/bulk/template
   */
  downloadTemplate: async (req: Request, res: Response) => {
    try {
      const buffer = bulkUploadService.generateTemplate();
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sankha-bulk-upload-template.xlsx');
      res.setHeader('Content-Length', buffer.length);
      
      return res.send(buffer);
    } catch (error) {
      console.error('Generate template error:', error);
      return errorResponse(res, 'Failed to generate template', null, 500);
    }
  },

  /**
   * Upload products via Excel file
   * POST /api/shops/:shopId/products/bulk
   */
  bulkUpload: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const file = req.file;

      // Check file was uploaded
      if (!file) {
        return errorResponse(res, 'No file uploaded. Please upload an Excel file (.xlsx)', null, 400);
      }

      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/octet-stream'
      ];
      if (!validTypes.includes(file.mimetype)) {
        return errorResponse(res, 'Invalid file type. Please upload an Excel file (.xlsx)', null, 400);
      }

      // Check shop ownership
      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to upload products to this shop", null, 403);
      }

      // Get shop details for email
      const shop = await prisma.shops.findUnique({
        where: { id: shopId },
        include: {
          users: {
            select: { email: true, first_name: true }
          }
        }
      });

      if (!shop) {
        return errorResponse(res, 'Shop not found', null, 404);
      }

      // Parse the Excel file
      const { rows, errors: parseErrors } = bulkUploadService.parseExcelFile(file.buffer);

      // Check row limit
      if (rows.length > MAX_UPLOAD_ROWS) {
        return errorResponse(
          res, 
          `File contains ${rows.length} products. Maximum allowed is ${MAX_UPLOAD_ROWS} products per upload.`, 
          null, 
          400
        );
      }

      // Check if any valid rows
      if (rows.length === 0 && parseErrors.length === 0) {
        return errorResponse(res, 'No valid product data found in the file', null, 400);
      }

      // Process the upload
      const result = await bulkUploadService.processBulkUpload(
        shopId,
        file.originalname,
        rows,
        parseErrors
      );

      // Send summary email to seller
      if (shop.users?.email) {
        try {
          await bulkUploadService.sendUploadSummaryEmail(
            shop.users.email,
            shop.users.first_name || 'Seller',
            result
          );
        } catch (emailError) {
          console.error('Failed to send upload summary email:', emailError);
          // Don't fail the request if email fails
        }
      }

      return successResponse(
        res,
        `Bulk upload completed: ${result.successful} products created, ${result.skipped} skipped, ${result.failed} failed`,
        {
          upload_id: result.uploadId,
          summary: {
            total_rows: result.totalRows,
            successful: result.successful,
            skipped: result.skipped,
            failed: result.failed
          },
          products: result.products,
          errors: result.errors.length > 0 ? result.errors : undefined,
          next_steps: result.successful > 0 ? {
            message: 'Products created with "Needs Images" status. Add images to make them live.',
            endpoint: `/api/shops/${shopId}/products/needs-images`
          } : undefined
        },
        201
      );
    } catch (error) {
      console.error('Bulk upload error:', error);
      return errorResponse(res, 'Failed to process bulk upload', null, 500);
    }
  },

  /**
   * Get products that need images
   * GET /api/shops/:shopId/products/needs-images
   */
  getProductsNeedingImages: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const result = await bulkUploadService.getProductsNeedingImages(
        shopId,
        Number(page),
        Number(limit)
      );

      return successResponse(
        res,
        'Products needing images retrieved successfully',
        result,
        200
      );
    } catch (error) {
      console.error('Get products needing images error:', error);
      return errorResponse(res, 'Failed to retrieve products', null, 500);
    }
  },

  /**
   * Add image to a shop product (changes status from NEEDS_IMAGES to PENDING_REVIEW)
   * POST /api/shops/:shopId/products/:shopProductId/image
   */
  addProductImage: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
      const file = req.file;

      if (!file) {
        return errorResponse(res, 'No image file uploaded', null, 400);
      }

      // Check shop ownership
      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to update this product", null, 403);
      }

      // Get the shop product
      const shopProduct = await prisma.shop_products.findFirst({
        where: {
          id: shopProductId,
          shop_id: shopId
        },
        include: {
          products: {
            select: { name: true }
          }
        }
      });

      if (!shopProduct) {
        return errorResponse(res, 'Product not found in your shop', null, 404);
      }

      // Upload image to Cloudinary
      const uploadResult = await CloudinaryService.uploadImage(
        file.buffer,
        `shops/${shopId}/products`
      );
      
      if (!uploadResult.success || !uploadResult.url) {
        return errorResponse(res, 'Failed to upload image', null, 500);
      }

      // Update product with image and change status
      const updatedProduct = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          images: [...shopProduct.images, uploadResult.url],
          listing_status: 'PENDING_REVIEW', // Move to pending review
          is_available: false, // Still not available until approved
          updated_at: new Date()
        }
      });

      return successResponse(
        res,
        'Image added successfully. Product is now pending review.',
        {
          id: updatedProduct.id,
          product_name: shopProduct.products.name,
          images: updatedProduct.images,
          listing_status: updatedProduct.listing_status
        },
        200
      );
    } catch (error) {
      console.error('Add product image error:', error);
      return errorResponse(res, 'Failed to add image', null, 500);
    }
  },

  /**
   * Get bulk upload history for a shop
   * GET /api/shops/:shopId/products/bulk/history
   */
  getUploadHistory: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const result = await bulkUploadService.getUploadHistory(
        shopId,
        Number(page),
        Number(limit)
      );

      return successResponse(
        res,
        'Upload history retrieved successfully',
        result,
        200
      );
    } catch (error) {
      console.error('Get upload history error:', error);
      return errorResponse(res, 'Failed to retrieve upload history', null, 500);
    }
  },

  /**
   * Get a specific bulk upload details
   * GET /api/shops/:shopId/products/bulk/:uploadId
   */
  getUploadDetails: async (req: Request, res: Response) => {
    try {
      const { shopId, uploadId } = req.params;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const upload = await prisma.bulk_uploads.findFirst({
        where: {
          id: uploadId,
          shop_id: shopId
        }
      });

      if (!upload) {
        return errorResponse(res, 'Upload not found', null, 404);
      }

      // Get products from this upload
      const products = await prisma.shop_products.findMany({
        where: {
          bulk_upload_id: uploadId
        },
        include: {
          products: {
            select: { name: true, brand: true }
          }
        }
      });

      return successResponse(
        res,
        'Upload details retrieved successfully',
        {
          upload: {
            id: upload.id,
            file_name: upload.file_name,
            total_rows: upload.total_rows,
            successful: upload.successful,
            failed: upload.failed,
            skipped: upload.skipped,
            status: upload.status,
            errors: upload.errors,
            created_at: upload.created_at,
            completed_at: upload.completed_at
          },
          products: products.map(p => ({
            id: p.id,
            product_name: p.products.name,
            brand: p.products.brand,
            sku: p.sku,
            base_price: p.base_price,
            display_price: p.price,
            stock_quantity: p.stock_quantity,
            listing_status: p.listing_status,
            images: p.images
          }))
        },
        200
      );
    } catch (error) {
      console.error('Get upload details error:', error);
      return errorResponse(res, 'Failed to retrieve upload details', null, 500);
    }
  },

  // ==========================================================================
  // v4.0 STAGING PIPELINE ENDPOINTS
  // ==========================================================================

  /**
   * Get preview of staging batch before commit
   * GET /api/shops/:shopId/products/bulk/:batchId/preview
   */
  getStagingPreview: async (req: Request, res: Response) => {
    try {
      const { shopId, batchId } = req.params;
      const { page = 1, showInvalid = 'false' } = req.query;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const preview = await bulkUploadStagingService.getPreview(
        shopId,
        batchId,
        Number(page),
        showInvalid === 'true'
      );

      return successResponse(res, 'Staging preview retrieved', preview, 200);
    } catch (error) {
      console.error('Get staging preview error:', error);
      return errorResponse(res, 'Failed to get preview', null, 500);
    }
  },

  /**
   * Commit a staging batch to production
   * POST /api/shops/:shopId/products/bulk/:batchId/commit
   */
  commitStagingBatch: async (req: Request, res: Response) => {
    try {
      const { shopId, batchId } = req.params;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const result = await bulkUploadStagingService.commitBatch(shopId, batchId);

      // Build next steps
      const nextSteps = [];
      if (result.needsImages > 0) {
        nextSteps.push({
          action: 'Add images to products',
          endpoint: `/api/shops/${shopId}/products/needs-images`,
          count: result.needsImages
        });
      }
      if (result.needsSpecs > 0) {
        nextSteps.push({
          action: 'Complete product specifications',
          endpoint: `/api/shops/${shopId}/products/needs-specs`,
          count: result.needsSpecs
        });
      }

      return successResponse(
        res,
        `Batch committed: ${result.committed} products created`,
        {
          summary: result,
          next_steps: nextSteps
        },
        201
      );
    } catch (error) {
      console.error('Commit staging batch error:', error);
      return errorResponse(res, 'Failed to commit batch', null, 500);
    }
  },

  /**
   * Cancel a staging batch
   * DELETE /api/shops/:shopId/products/bulk/:batchId/cancel
   */
  cancelStagingBatch: async (req: Request, res: Response) => {
    try {
      const { shopId, batchId } = req.params;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      await bulkUploadStagingService.cancelBatch(shopId, batchId);

      return successResponse(res, 'Batch cancelled successfully', null, 200);
    } catch (error) {
      console.error('Cancel staging batch error:', error);
      return errorResponse(res, 'Failed to cancel batch', null, 500);
    }
  },

  /**
   * Download correction file for invalid rows
   * GET /api/shops/:shopId/products/bulk/:batchId/corrections
   */
  downloadCorrections: async (req: Request, res: Response) => {
    try {
      const { shopId, batchId } = req.params;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const { buffer, filename, summary } = await bulkUploadCorrectionService.generateCorrectionFile(
        shopId,
        batchId
      );

      // Mark as downloaded
      await bulkUploadCorrectionService.markCorrectionDownloaded(shopId, batchId);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('X-Correction-Summary', JSON.stringify(summary));

      return res.send(buffer);
    } catch (error: any) {
      console.error('Download corrections error:', error);
      if (error.message === 'No invalid rows found in this batch') {
        return errorResponse(res, error.message, null, 404);
      }
      return errorResponse(res, 'Failed to generate correction file', null, 500);
    }
  },

  /**
   * Get preview of correction errors
   * GET /api/shops/:shopId/products/bulk/:batchId/corrections/preview
   */
  getCorrectionPreview: async (req: Request, res: Response) => {
    try {
      const { shopId, batchId } = req.params;
      const { limit = 10 } = req.query;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const preview = await bulkUploadCorrectionService.getCorrectionPreview(
        shopId,
        batchId,
        Number(limit)
      );

      return successResponse(res, 'Correction preview retrieved', preview, 200);
    } catch (error) {
      console.error('Get correction preview error:', error);
      return errorResponse(res, 'Failed to get correction preview', null, 500);
    }
  },

  /**
   * Get products needing specs
   * GET /api/shops/:shopId/products/needs-specs
   */
  getProductsNeedingSpecs: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to access this shop", null, 403);
      }

      const result = await bulkUploadCorrectionService.getProductsNeedingSpecs(
        shopId,
        Number(page),
        Number(limit)
      );

      return successResponse(res, 'Products needing specs retrieved', result, 200);
    } catch (error) {
      console.error('Get products needing specs error:', error);
      return errorResponse(res, 'Failed to retrieve products', null, 500);
    }
  },

  /**
   * Update specs for a product
   * PATCH /api/shops/:shopId/products/:shopProductId/specs
   */
  updateProductSpecs: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
      const { specs } = req.body;

      if (!specs || typeof specs !== 'object') {
        return errorResponse(res, 'Specs object is required', null, 400);
      }

      const hasAccess = await checkShopOwnership(shopId, req.user!.id, req.user!.role);
      if (!hasAccess) {
        return errorResponse(res, "You don't have permission to update this product", null, 403);
      }

      const result = await bulkUploadCorrectionService.updateProductSpecs(
        shopProductId,
        shopId,
        specs
      );

      return successResponse(
        res,
        result.newStatus === 'NEEDS_IMAGES' 
          ? 'Specs updated! Product now needs images.'
          : 'Specs updated. Some required specs are still missing.',
        {
          new_status: result.newStatus,
          specs_complete: result.newStatus === 'NEEDS_IMAGES'
        },
        200
      );
    } catch (error: any) {
      console.error('Update product specs error:', error);
      if (error.message === 'Product not found') {
        return errorResponse(res, error.message, null, 404);
      }
      return errorResponse(res, 'Failed to update specs', null, 500);
    }
  }
};
};
