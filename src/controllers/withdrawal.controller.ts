import { Request, Response } from 'express';
import { withdrawalService } from '../services/withdrawal.service';
import { successResponse, errorResponse } from '../utils/response';
import prisma from '../prismaClient';

/**
 * Request a withdrawal from shop wallet
 * POST /api/withdrawals
 * Seller only
 */
export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { amount, recipient_phone, recipient_name, provider, shop_id } = req.body;

    // Get seller's shop - specific one or the one with highest balance
    let shop;
    if (shop_id) {
      shop = await prisma.shops.findFirst({
        where: { owner_id: userId, id: shop_id },
        select: { id: true, name: true, wallet_balance: true }
      });
    } else {
      shop = await prisma.shops.findFirst({
        where: { owner_id: userId },
        select: { id: true, name: true, wallet_balance: true },
        orderBy: { wallet_balance: 'desc' }
      });
    }

    if (!shop) {
      return errorResponse(res, 'You do not have a shop', 404);
    }

    const result = await withdrawalService.requestWithdrawal({
      shopId: shop.id,
      amount,
      recipientPhone: recipient_phone,
      recipientName: recipient_name,
      provider,
    });

    if (!result.success) {
      const statusCode = result.errorCode === 'VALIDATION_ERROR' ? 400 : 500;
      return errorResponse(res, result.error || 'Withdrawal request failed', statusCode);
    }

    return successResponse(res, 'Withdrawal request submitted successfully', {
      withdrawal: {
        id: result.withdrawal.id,
        amount: Number(result.withdrawal.amount),
        fee: Number(result.withdrawal.fee),
        net_amount: Number(result.withdrawal.net_amount),
        recipient_phone: result.withdrawal.recipient_phone,
        recipient_name: result.withdrawal.recipient_name,
        provider: result.withdrawal.provider,
        status: result.withdrawal.status,
        tx_ref: result.withdrawal.tx_ref,
        requested_at: result.withdrawal.requested_at,
      },
      new_balance: Number(result.withdrawal.balance_after),
    }, 201);
  } catch (error) {
    console.error('Request withdrawal error:', error);
    return errorResponse(res, 'Failed to request withdrawal', 500);
  }
};

/**
 * Get my withdrawals
 * GET /api/withdrawals
 * Seller only
 */
export const getMyWithdrawals = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, page, limit, shop_id } = req.query;

    // Get seller's shops
    const shops = await prisma.shops.findMany({
      where: { owner_id: userId },
      select: { id: true }
    });

    if (shops.length === 0) {
      return errorResponse(res, 'You do not have a shop', 404);
    }

    // Filter by specific shop or get all
    const shopIds = shop_id 
      ? [shop_id as string] 
      : shops.map(s => s.id);

    const result = await withdrawalService.getShopWithdrawals(shopIds[0], {
      status: status as any,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    // If no specific shop, get all withdrawals across all shops
    let allWithdrawals = result.withdrawals;
    if (!shop_id && shops.length > 1) {
      for (let i = 1; i < shopIds.length; i++) {
        const moreResult = await withdrawalService.getShopWithdrawals(shopIds[i], {
          status: status as any,
          page: 1,
          limit: 100, // Get all for now
        });
        allWithdrawals = [...allWithdrawals, ...moreResult.withdrawals];
      }
      // Sort by date
      allWithdrawals.sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    }

    return successResponse(res, 'Withdrawals retrieved successfully', {
      withdrawals: allWithdrawals.map(w => ({
        id: w.id,
        amount: Number(w.amount),
        fee: Number(w.fee),
        net_amount: Number(w.net_amount),
        recipient_phone: w.recipient_phone,
        recipient_name: w.recipient_name,
        provider: w.provider,
        status: w.status,
        tx_ref: w.tx_ref,
        payout_reference: w.payout_reference,
        requested_at: w.requested_at,
        completed_at: w.completed_at,
        failure_reason: w.failure_reason,
      })),
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    return errorResponse(res, 'Failed to retrieve withdrawals', 500);
  }
};

/**
 * Get withdrawal details
 * GET /api/withdrawals/:id
 * Seller only
 */
export const getWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const withdrawal = await withdrawalService.getWithdrawal(id);

    if (!withdrawal) {
      return errorResponse(res, 'Withdrawal not found', 404);
    }

    // Check ownership
    const shop = await prisma.shops.findFirst({
      where: { owner_id: userId, id: withdrawal.shop_id }
    });

    if (!shop) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    return successResponse(res, 'Withdrawal retrieved successfully', {
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      fee: Number(withdrawal.fee),
      net_amount: Number(withdrawal.net_amount),
      recipient_phone: withdrawal.recipient_phone,
      recipient_name: withdrawal.recipient_name,
      provider: withdrawal.provider,
      status: withdrawal.status,
      tx_ref: withdrawal.tx_ref,
      payout_reference: withdrawal.payout_reference,
      balance_before: Number(withdrawal.balance_before),
      balance_after: Number(withdrawal.balance_after),
      requested_at: withdrawal.requested_at,
      processed_at: withdrawal.processed_at,
      completed_at: withdrawal.completed_at,
      failed_at: withdrawal.failed_at,
      failure_reason: withdrawal.failure_reason,
      shop: withdrawal.shops,
    });
  } catch (error) {
    console.error('Get withdrawal error:', error);
    return errorResponse(res, 'Failed to retrieve withdrawal', 500);
  }
};

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
        recipient_phone: w.recipient_phone,
        recipient_name: w.recipient_name,
        provider: w.provider,
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

    const result = await withdrawalService.processWithdrawal(id);

    if (!result.success) {
      // If API unavailable, return info about manual processing
      if (result.errorCode === 'API_UNAVAILABLE') {
        return successResponse(res, result.error || 'Queued for manual processing', {
          withdrawal_id: id,
          status: 'PENDING',
          needs_manual_processing: true,
        }, 202);
      }

      const statusCode = result.errorCode === 'NOT_FOUND' ? 404 : 400;
      return errorResponse(res, result.error || 'Failed to process withdrawal', statusCode);
    }

    return successResponse(res, 'Withdrawal processed successfully', {
      withdrawal: result.withdrawal,
    });
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
  requestWithdrawal,
  getMyWithdrawals,
  getWithdrawal,
  cancelWithdrawal,
  getWalletSummary,
  adminGetPendingWithdrawals,
  adminProcessWithdrawal,
  adminCompleteWithdrawal,
  adminFailWithdrawal,
};
