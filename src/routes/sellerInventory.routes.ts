/**
 * Seller Inventory Routes v4.0
 * =============================
 * Routes for seller dashboard "Needs Attention" features.
 * 
 * NOTE: Some v4.0 features require schema migration and return 501 Not Implemented.
 */

import { Router } from 'express';
import { sellerInventoryController } from '../controllers/sellerInventory.controller';
import { protect } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';

const router = Router();

// All routes require authentication + seller role
router.use(protect);
router.use(authorize('SELLER', 'ADMIN'));

/**
 * @route   GET /api/seller/inventory/pending-actions
 * @desc    Get dashboard summary of items needing attention
 * @access  Seller
 * @query   lang - Language for notifications (en/ny)
 */
router.get('/pending-actions', sellerInventoryController.getPendingActions);

/**
 * @route   GET /api/seller/inventory/needs-specs
 * @desc    Get products that need specifications (v4.0 - not implemented)
 * @access  Seller
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
 * @desc    Download correction file (v4.0 - not implemented)
 * @access  Seller
 */
router.get('/uploads/:batchId/corrections', sellerInventoryController.downloadCorrectionFile);

/**
 * @route   GET /api/seller/uploads/:batchId/corrections/preview
 * @desc    Preview correction data (v4.0 - not implemented)
 * @access  Seller
 */
router.get('/uploads/:batchId/corrections/preview', sellerInventoryController.previewCorrectionFile);

/**
 * @route   PATCH /api/seller/products/:shopProductId/specs
 * @desc    Update specs for a product
 * @access  Seller (owner only)
 * @body    { specs: { ram: "8GB", storage: "256GB", ... } }
 */
router.patch('/products/:shopProductId/specs', sellerInventoryController.updateProductSpecs);

export default router;
