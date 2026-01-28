import { Router } from 'express';
import { withdrawalController } from '../controllers/withdrawal.controller';
import { protect } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';
import validateResource from '../middleware/validateResource';
import {
  requestWithdrawalSchema,
  getWithdrawalSchema,
  listWithdrawalsSchema,
  adminCompleteWithdrawalSchema,
  adminFailWithdrawalSchema,
} from '../schemas/withdrawal.schema';

const router = Router();

// ==================== SELLER ROUTES ====================

/**
 * @route   GET /api/withdrawals/wallet
 * @desc    Get wallet summary with balance and recent transactions
 * @access  Seller
 */
router.get(
  '/wallet',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  withdrawalController.getWalletSummary
);

/**
 * @route   POST /api/withdrawals
 * @desc    Request a withdrawal from shop wallet
 * @access  Seller
 */
router.post(
  '/',
  protect,
  authorize('SELLER'),
  validateResource(requestWithdrawalSchema),
  withdrawalController.requestWithdrawal
);

/**
 * @route   GET /api/withdrawals
 * @desc    Get my withdrawal history
 * @access  Seller
 */
router.get(
  '/',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  validateResource(listWithdrawalsSchema),
  withdrawalController.getMyWithdrawals
);

/**
 * @route   GET /api/withdrawals/:id
 * @desc    Get withdrawal details
 * @access  Seller (own withdrawals only)
 */
router.get(
  '/:id',
  protect,
  authorize('SELLER', 'ADMIN', 'SUPER_ADMIN'),
  validateResource(getWithdrawalSchema),
  withdrawalController.getWithdrawal
);

/**
 * @route   POST /api/withdrawals/:id/cancel
 * @desc    Cancel a pending withdrawal
 * @access  Seller (own withdrawals only)
 */
router.post(
  '/:id/cancel',
  protect,
  authorize('SELLER'),
  validateResource(getWithdrawalSchema),
  withdrawalController.cancelWithdrawal
);

// ==================== ADMIN ROUTES ====================

/**
 * @route   GET /api/withdrawals/admin/pending
 * @desc    Get all pending withdrawals for processing
 * @access  Admin
 */
router.get(
  '/admin/pending',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN'),
  withdrawalController.adminGetPendingWithdrawals
);

/**
 * @route   POST /api/withdrawals/admin/:id/process
 * @desc    Process a withdrawal via PayChangu payout API
 * @access  Admin
 */
router.post(
  '/admin/:id/process',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validateResource(getWithdrawalSchema),
  withdrawalController.adminProcessWithdrawal
);

/**
 * @route   POST /api/withdrawals/admin/:id/complete
 * @desc    Manually mark a withdrawal as completed
 * @access  Admin
 */
router.post(
  '/admin/:id/complete',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validateResource(adminCompleteWithdrawalSchema),
  withdrawalController.adminCompleteWithdrawal
);

/**
 * @route   POST /api/withdrawals/admin/:id/fail
 * @desc    Manually mark a withdrawal as failed (restores balance)
 * @access  Admin
 */
router.post(
  '/admin/:id/fail',
  protect,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validateResource(adminFailWithdrawalSchema),
  withdrawalController.adminFailWithdrawal
);

export default router;
