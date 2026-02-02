/**
 * Seller Inventory Routes v4.0
 * =============================
 * Routes for seller dashboard "Needs Attention" features.
 */

import { Router } from 'express';
import { sellerInventoryController } from '../controllers/sellerInventory.controller';
import { protect } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';

const router = Router();

// All routes require authentication + seller role
router.use(protect);
router.use(authorize(['SELLER', 'ADMIN']));

/**
 * @route   GET /api/seller/inventory/pending-actions
 * @desc    Get dashboard summary of items needing attention
 * @access  Seller
 * @query   lang - Language for notifications (en/ny)
 */
router.get('/pending-actions', sellerInventoryController.getPendingActions);

/**
 * @route   GET /api/seller/inventory/needs-specs
 * @desc    Get products that need specifications
 * @access  Seller
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 */
router.get('/needs-specs', sellerInventoryController.getProductsNeedingSpecs);

/**
 * @route   GET /api/seller/inventory/needs-images
 * @desc    Get products that need images
 * @access  Seller
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 */
router.get('/needs-images', sellerInventoryController.getProductsNeedingImages);

/**
 * @route   GET /api/seller/uploads/:batchId/corrections
 * @desc    Download correction CSV/Excel for failed rows
 * @access  Seller (owner only)
 * @query   format - File format (xlsx/csv, default: xlsx)
 * @query   chichewa - Include Chichewa translations (default: true)
 */
router.get('/uploads/:batchId/corrections', sellerInventoryController.downloadCorrectionFile);

/**
 * @route   GET /api/seller/uploads/:batchId/corrections/preview
 * @desc    Preview correction data before download
 * @access  Seller (owner only)
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 */
router.get('/uploads/:batchId/corrections/preview', sellerInventoryController.previewCorrections);

/**
 * @route   PATCH /api/seller/products/:shopProductId/specs
 * @desc    Update specs for a product (NEEDS_SPECS -> NEEDS_IMAGES)
 * @access  Seller (owner only)
 * @body    { specs: { ram: "8GB", storage: "256GB", ... } }
 */
router.patch('/products/:shopProductId/specs', sellerInventoryController.updateProductSpecs);

/**
 * @route   GET /api/seller/categories/:categoryName/required-specs
 * @desc    Get required specs for a category (UI helper)
 * @access  Seller
 */
router.get('/categories/:categoryName/required-specs', sellerInventoryController.getRequiredSpecs);

export default router;
