import { Request, Response } from 'express';
import { withdrawalService } from '../services/withdrawal.service';
import { successResponse, errorResponse } from '../utils/response';
import prisma from '../prismaClient';

/**
 * GET /api/withdrawals/destinations
 * Seller authenticated — returns payout destinations for dropdown
 */
export const getDestinations = async (req: Request, res: Response) => {
  try {
    const destinations = await withdrawalService.getPayoutDestinations();
    return successResponse(res, 'Payout destinations retrieved', {
      destinations: destinations.map(d => ({
        uuid: d.uuid,
        name: d.name,
        type: d.type,
      })),
    });
  } catch (error) {
    console.error('Get destinations error:', error);
    return errorResponse(res, 'Failed to retrieve payout destinations', 500);
  }
};

/**
 * POST /api/withdrawals
 * Seller authenticated — initiate a withdrawal
 * Body: { amount, destination_uuid, account_number, account_name }
 * CRITICAL: account_number and account_name NEVER appear in response, logs, or DB
 */
export const initiateWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { amount, destination_uuid, account_number, account_name, shop_id } = req.body;

    // Get seller's shop
    let shop;
    if (shop_id) {
      shop = await prisma.shops.findFirst({
        where: { owner_id: userId, id: shop_id },
        select: { id: true },
      });
    } else {
      shop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true },
        orderBy: { wallet_balance: 'desc' },
      });
    }

    if (!shop) {
      return errorResponse(res, 'You do not have a shop', null, 404);
    }

    // Calculate fees for the response message
    const destination = await withdrawalService.getDestinationByUuid(destination_uuid);
    const fees = destination
      ? withdrawalService.calculateWithdrawalFees(amount, destination.type)
      : null;

    await withdrawalService.processWithdrawal({
      shop_id: shop.id,
      amount,
      destination_uuid,
      account_number,
      account_name,
    });

    const netDisplay = fees ? `MWK ${fees.netAmount.toLocaleString()}` : 'your payout';

    return successResponse(
      res,
      `Withdrawal initiated. You will receive ${netDisplay} after fees. We will notify you when complete.`,
      undefined,
      201,
    );
  } catch (error: any) {
    const message = error.message || 'Withdrawal request failed';
    const isValidation = [
      'Insufficient wallet balance',
      'Minimum withdrawal',
      'Maximum withdrawal',
      'Please select',
      'Account number is required',
      'Account name is required',
      'Invalid payout destination',
      'Shop not found',
    ].some(v => message.includes(v));
    return errorResponse(res, message, null, isValidation ? 400 : 500);
  }
};

/**
 * GET /api/withdrawals
 * Seller authenticated — withdrawal history
 * Returns safe fields only (destination name, never raw uuid or account info)
 */
export const getMyWithdrawals = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, page, limit, shop_id } = req.query;

    const shops = await prisma.shops.findMany({
      where: { owner_id: userId },
      select: { id: true },
    });

    if (shops.length === 0) {
      return errorResponse(res, 'You do not have a shop', null, 404);
    }

    const targetShopId = shop_id ? (shop_id as string) : shops[0].id;

    const result = await withdrawalService.getShopWithdrawals(targetShopId, {
      status: status as any,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    // Look up destination names for display
    const destinations = await withdrawalService.getPayoutDestinations();
    const destMap = new Map(destinations.map(d => [d.uuid, d.name]));

    return successResponse(res, 'Withdrawals retrieved successfully', {
      withdrawals: result.withdrawals.map(w => ({
        id: w.id,
        amount: Number(w.amount),
        net_amount: Number(w.net_amount),
        status: w.status,
        payout_method: w.payout_method,
        destination_name: w.destination_uuid ? destMap.get(w.destination_uuid) || 'Unknown' : w.provider || 'N/A',
        created_at: w.created_at,
        completed_at: w.completed_at,
        failure_reason: w.failure_reason,
      })),
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    return errorResponse(res, 'Failed to retrieve withdrawals', null, 500);
  }
};

/**
 * GET /api/withdrawals/:id
 * Seller authenticated — must own the shop
 * Returns safe fields (destination name, never account info)
 */
export const getWithdrawalById = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const withdrawal = await withdrawalService.getWithdrawal(id);
    if (!withdrawal) {
      return errorResponse(res, 'Withdrawal not found', null, 404);
    }

    const shop = await prisma.shops.findFirst({
      where: { owner_id: userId, id: withdrawal.shop_id },
    });
    if (!shop) {
      return errorResponse(res, 'Unauthorized', null, 403);
    }

    // Resolve destination name
    let destinationName = 'N/A';
    if (withdrawal.destination_uuid) {
      const dest = await withdrawalService.getDestinationByUuid(withdrawal.destination_uuid);
      destinationName = dest?.name || 'Unknown';
    }

    return successResponse(res, 'Withdrawal retrieved successfully', {
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      net_amount: Number(withdrawal.net_amount),
      paychangu_fee: withdrawal.paychangu_fee ? Number(withdrawal.paychangu_fee) : null,
      bank_fee: withdrawal.bank_fee ? Number(withdrawal.bank_fee) : null,
      debt_deducted: Number(withdrawal.debt_deducted),
      status: withdrawal.status,
      payout_method: withdrawal.payout_method,
      destination_name: destinationName,
      requested_at: withdrawal.requested_at,
      processed_at: withdrawal.processed_at,
      completed_at: withdrawal.completed_at,
      failed_at: withdrawal.failed_at,
      failure_reason: withdrawal.failure_reason,
      shop: withdrawal.shops,
    });
  } catch (error) {
    console.error('Get withdrawal error:', error);
    return errorResponse(res, 'Failed to retrieve withdrawal', null, 500);
  }
};

// ─── EXISTING ENDPOINTS (kept for backward compat) ──────────────

export const requestWithdrawal = initiateWithdrawal;

export const getWithdrawal = getWithdrawalById;

/**
 * Cancel a pending withdrawal
 * POST /api/withdrawals/:id/cancel
 * Seller only
 */
export const cancelWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await withdrawalService.cancelWithdrawal(id, userId);

    if (!result.success) {
      const statusCode = result.errorCode === 'NOT_FOUND' ? 404 
                       : result.errorCode === 'UNAUTHORIZED' ? 403 
                       : 400;
      return errorResponse(res, result.error || 'Failed to cancel withdrawal', statusCode);
    }

    return successResponse(res, 'Withdrawal cancelled successfully', {
      withdrawal_id: id,
      status: 'CANCELLED',
    });
  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    return errorResponse(res, 'Failed to cancel withdrawal', 500);
  }
};

/**
 * Get wallet balance and recent transactions
 * GET /api/withdrawals/wallet
 * Seller only
 */
export const getWalletSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { shop_id } = req.query;  // Optional: specify which shop

    // Get seller's shop with wallet balance
    let shop;
    if (shop_id) {
      // Specific shop requested
      shop = await prisma.shops.findFirst({
        where: { owner_id: userId, id: shop_id as string },
        select: { 
          id: true, 
          name: true, 
          wallet_balance: true,
        }
      });
    } else {
      // Get all shops and return the one with highest balance (or first if none have balance)
      const shops = await prisma.shops.findMany({
        where: { owner_id: userId },
        select: { 
          id: true, 
          name: true, 
          wallet_balance: true,
        },
        orderBy: { wallet_balance: 'desc' }
      });
      shop = shops[0];
    }

    if (!shop) {
      return errorResponse(res, 'You do not have a shop', 404);
    }

    // Get recent transactions
    const recentTransactions = await prisma.transactions.findMany({
      where: { shop_id: shop.id },
      orderBy: { created_at: 'desc' },
      take: 10,
      include: {
        orders: {
          select: { order_number: true }
        }
      }
    });

    // Get pending withdrawals total
    const pendingWithdrawals = await prisma.withdrawals.aggregate({
      where: { 
        shop_id: shop.id, 
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      _sum: { amount: true },
      _count: true,
    });

    // Calculate available balance (wallet - pending withdrawals)
    const walletBalance = Number(shop.wallet_balance);
    const pendingAmount = Number(pendingWithdrawals._sum.amount || 0);
    const availableBalance = walletBalance; // Already deducted when withdrawal requested

    return successResponse(res, 'Wallet summary retrieved successfully', {
      shop: {
        id: shop.id,
        name: shop.name,
      },
      wallet: {
        balance: walletBalance,
        available: availableBalance,
        pending_withdrawals: pendingAmount,
        pending_withdrawals_count: pendingWithdrawals._count,
      },
      recent_transactions: recentTransactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        order_number: t.orders?.order_number,
        description: t.description,
        created_at: t.created_at,
      })),
    });
  } catch (error) {
    console.error('Get wallet summary error:', error);
    return errorResponse(res, 'Failed to retrieve wallet summary', 500);
  }
};

// ==================== ADMIN ENDPOINTS ====================

/**
 * Get all pending withdrawals (Admin)
 * GET /api/admin/withdrawals/pending
 */
export const adminGetPendingWithdrawals = async (req: Request, res: Response) => {
  try {
    const withdrawals = await withdrawalService.getPendingWithdrawals();

    return successResponse(res, 'Pending withdrawals retrieved', {
      count: withdrawals.length,
      withdrawals: withdrawals.map(w => ({
        id: w.id,
        shop: w.shops,
        amount: Number(w.amount),
        fee: Number(w.fee),
        net_amount: Number(w.net_amount),
        payout_method: w.payout_method,
        destination_uuid: w.destination_uuid,
        tx_ref: w.tx_ref,
        requested_at: w.requested_at,
      })),
    });
  } catch (error) {
    console.error('Admin get pending withdrawals error:', error);
    return errorResponse(res, 'Failed to retrieve pending withdrawals', 500);
  }
};

/**
 * Process a withdrawal (Admin)
 * POST /api/admin/withdrawals/:id/process
 */
export const adminProcessWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Admin process is deprecated in the new flow — withdrawals are initiated directly by sellers.
    // Keeping this endpoint for legacy compatibility.
    return errorResponse(res, 'Admin manual processing is deprecated. Sellers now initiate withdrawals directly.', null, 410);
  } catch (error) {
    console.error('Admin process withdrawal error:', error);
    return errorResponse(res, 'Failed to process withdrawal', 500);
  }
};

/**
 * Manually complete a withdrawal (Admin)
 * POST /api/admin/withdrawals/:id/complete
 */
export const adminCompleteWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reference } = req.body;

    if (!reference) {
      return errorResponse(res, 'Payout reference is required', 400);
    }

    const result = await withdrawalService.adminCompleteWithdrawal(id, reference);

    if (!result.success) {
      const statusCode = result.errorCode === 'NOT_FOUND' ? 404 : 400;
      return errorResponse(res, result.error || 'Failed to complete withdrawal', statusCode);
    }

    return successResponse(res, 'Withdrawal marked as completed', {
      withdrawal_id: id,
      status: 'COMPLETED',
      payout_reference: reference,
    });
  } catch (error) {
    console.error('Admin complete withdrawal error:', error);
    return errorResponse(res, 'Failed to complete withdrawal', 500);
  }
};

/**
 * Manually fail a withdrawal (Admin)
 * POST /api/admin/withdrawals/:id/fail
 */
export const adminFailWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return errorResponse(res, 'Failure reason is required', 400);
    }

    const result = await withdrawalService.adminFailWithdrawal(id, reason);

    if (!result.success) {
      const statusCode = result.errorCode === 'NOT_FOUND' ? 404 : 400;
      return errorResponse(res, result.error || 'Failed to fail withdrawal', statusCode);
    }

    return successResponse(res, 'Withdrawal marked as failed. Balance restored.', {
      withdrawal_id: id,
      status: 'FAILED',
      reason,
    });
  } catch (error) {
    console.error('Admin fail withdrawal error:', error);
    return errorResponse(res, 'Failed to update withdrawal', 500);
  }
};

export const withdrawalController = {
  getDestinations,
  initiateWithdrawal,
  requestWithdrawal,
  getMyWithdrawals,
  getWithdrawal,
  getWithdrawalById,
  cancelWithdrawal,
  getWalletSummary,
  adminGetPendingWithdrawals,
  adminProcessWithdrawal,
  adminCompleteWithdrawal,
  adminFailWithdrawal,
};
