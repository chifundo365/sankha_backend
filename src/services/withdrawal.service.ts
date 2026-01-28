import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { paychanguConfig } from '../config/paychangu.config';
import { Prisma, withdrawal_status, transaction_type, transaction_status } from '../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Withdrawal fee configuration
const WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 1000,           // Minimum withdrawal: 1,000 MWK
  MAX_AMOUNT: 5000000,        // Maximum withdrawal: 5,000,000 MWK
  PLATFORM_FEE_PERCENT: 0,    // Platform fee (0% for now, PayChangu charges separately)
  PAYCHANGU_FEE_PERCENT: 1.5, // PayChangu payout fee estimate
};

// Supported mobile money providers in Malawi
const MOBILE_PROVIDERS = {
  AIRTEL: 'airtel_mw',
  TNM: 'tnm_mw',
};

export interface WithdrawalRequestData {
  shopId: string;
  amount: number;
  recipientPhone: string;
  recipientName: string;
  provider?: string; // airtel_mw or tnm_mw
}

export interface WithdrawalResult {
  success: boolean;
  withdrawal?: any;
  error?: string;
  errorCode?: string;
}

export interface PaychanguPayoutResponse {
  status: string;
  message: string;
  data?: {
    reference?: string;
    tx_ref?: string;
    status?: string;
  };
}

/**
 * Withdrawal Service
 * Handles seller payouts from their Sankha wallet
 */
class WithdrawalService {
  private apiBase: string;
  private secretKey: string;

  constructor() {
    this.apiBase = paychanguConfig.apiBase;
    this.secretKey = paychanguConfig.secretKey;
  }

  /**
   * Generate unique transaction reference for payout
   */
  generateTxRef(): string {
    return `PAYOUT-${uuidv4()}`;
  }

  /**
   * Detect mobile money provider from phone number
   */
  detectProvider(phone: string): string {
    // Malawi phone number patterns
    // Airtel: 099x, 088x, 098x
    // TNM: 088x, 0999 (some overlap)
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.startsWith('265')) {
      const localNumber = cleanPhone.slice(3);
      if (localNumber.startsWith('99') || localNumber.startsWith('98')) {
        return MOBILE_PROVIDERS.AIRTEL;
      }
      if (localNumber.startsWith('88') || localNumber.startsWith('89')) {
        return MOBILE_PROVIDERS.TNM;
      }
    } else {
      if (cleanPhone.startsWith('099') || cleanPhone.startsWith('098')) {
        return MOBILE_PROVIDERS.AIRTEL;
      }
      if (cleanPhone.startsWith('088') || cleanPhone.startsWith('089')) {
        return MOBILE_PROVIDERS.TNM;
      }
    }
    
    // Default to Airtel if unknown
    return MOBILE_PROVIDERS.AIRTEL;
  }

  /**
   * Calculate withdrawal fee
   */
  calculateFee(amount: number): { fee: number; netAmount: number } {
    const platformFee = amount * (WITHDRAWAL_CONFIG.PLATFORM_FEE_PERCENT / 100);
    const paychanguFee = amount * (WITHDRAWAL_CONFIG.PAYCHANGU_FEE_PERCENT / 100);
    const totalFee = Math.ceil(platformFee + paychanguFee);
    const netAmount = amount - totalFee;
    
    return { fee: totalFee, netAmount };
  }

  /**
   * Validate withdrawal request
   */
  async validateWithdrawal(data: WithdrawalRequestData): Promise<{ valid: boolean; error?: string }> {
    // Check minimum amount
    if (data.amount < WITHDRAWAL_CONFIG.MIN_AMOUNT) {
      return { 
        valid: false, 
        error: `Minimum withdrawal amount is MWK ${WITHDRAWAL_CONFIG.MIN_AMOUNT.toLocaleString()}` 
      };
    }

    // Check maximum amount
    if (data.amount > WITHDRAWAL_CONFIG.MAX_AMOUNT) {
      return { 
        valid: false, 
        error: `Maximum withdrawal amount is MWK ${WITHDRAWAL_CONFIG.MAX_AMOUNT.toLocaleString()}` 
      };
    }

    // Get shop and check balance
    const shop = await prisma.shops.findUnique({
      where: { id: data.shopId },
      select: { id: true, wallet_balance: true, name: true, owner_id: true }
    });

    if (!shop) {
      return { valid: false, error: 'Shop not found' };
    }

    const balance = new Decimal(shop.wallet_balance);
    if (balance.lessThan(data.amount)) {
      return { 
        valid: false, 
        error: `Insufficient balance. Available: MWK ${balance.toFixed(2)}` 
      };
    }

    // Check for pending withdrawals
    const pendingWithdrawal = await prisma.withdrawals.findFirst({
      where: {
        shop_id: data.shopId,
        status: { in: ['PENDING', 'PROCESSING'] }
      }
    });

    if (pendingWithdrawal) {
      return { 
        valid: false, 
        error: 'You have a pending withdrawal. Please wait for it to complete.' 
      };
    }

    return { valid: true };
  }

  /**
   * Request a withdrawal
   */
  async requestWithdrawal(data: WithdrawalRequestData): Promise<WithdrawalResult> {
    try {
      // Validate
      const validation = await this.validateWithdrawal(data);
      if (!validation.valid) {
        return { success: false, error: validation.error, errorCode: 'VALIDATION_ERROR' };
      }

      // Get shop for balance
      const shop = await prisma.shops.findUnique({
        where: { id: data.shopId },
        select: { id: true, wallet_balance: true, name: true }
      });

      if (!shop) {
        return { success: false, error: 'Shop not found', errorCode: 'SHOP_NOT_FOUND' };
      }

      // Calculate fee
      const { fee, netAmount } = this.calculateFee(data.amount);
      const provider = data.provider || this.detectProvider(data.recipientPhone);
      const txRef = this.generateTxRef();

      const balanceBefore = new Decimal(shop.wallet_balance);
      const balanceAfter = balanceBefore.minus(data.amount);

      // Create withdrawal and transaction in a single transaction
      const [withdrawal, transaction, updatedShop] = await prisma.$transaction([
        // Create withdrawal record
        prisma.withdrawals.create({
          data: {
            shop_id: data.shopId,
            amount: new Prisma.Decimal(data.amount),
            fee: new Prisma.Decimal(fee),
            net_amount: new Prisma.Decimal(netAmount),
            status: 'PENDING',
            payout_method: 'mobile_money',
            recipient_phone: data.recipientPhone,
            recipient_name: data.recipientName,
            provider,
            tx_ref: txRef,
            balance_before: new Prisma.Decimal(balanceBefore.toString()),
            balance_after: new Prisma.Decimal(balanceAfter.toString()),
          }
        }),
        // Create transaction record
        prisma.transactions.create({
          data: {
            shop_id: data.shopId,
            type: 'PAYOUT',
            amount: new Prisma.Decimal(-data.amount), // Negative for withdrawal
            balance_before: new Prisma.Decimal(balanceBefore.toString()),
            balance_after: new Prisma.Decimal(balanceAfter.toString()),
            status: 'PENDING',
            payout_reference: txRef,
            description: `Withdrawal to ${data.recipientPhone}`,
          }
        }),
        // Deduct from wallet immediately (hold)
        prisma.shops.update({
          where: { id: data.shopId },
          data: {
            wallet_balance: new Prisma.Decimal(balanceAfter.toString()),
            updated_at: new Date(),
          }
        })
      ]);

      // Link transaction to withdrawal
      await prisma.withdrawals.update({
        where: { id: withdrawal.id },
        data: { transaction_id: transaction.id }
      });

      console.log(`Withdrawal requested: ${txRef} for shop ${shop.name}, amount: ${data.amount}`);

      return {
        success: true,
        withdrawal: {
          ...withdrawal,
          transaction_id: transaction.id,
        }
      };
    } catch (error: any) {
      console.error('Withdrawal request error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to process withdrawal request',
        errorCode: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Process a pending withdrawal via PayChangu Payout API
   * Note: This requires PayChangu's payout/disbursement API access
   */
  async processWithdrawal(withdrawalId: string): Promise<WithdrawalResult> {
    try {
      const withdrawal = await prisma.withdrawals.findUnique({
        where: { id: withdrawalId },
        include: { shops: { select: { name: true } } }
      });

      if (!withdrawal) {
        return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
      }

      if (withdrawal.status !== 'PENDING') {
        return { success: false, error: `Withdrawal is already ${withdrawal.status}`, errorCode: 'INVALID_STATUS' };
      }

      // Update status to PROCESSING
      await prisma.withdrawals.update({
        where: { id: withdrawalId },
        data: { 
          status: 'PROCESSING',
          processed_at: new Date(),
          updated_at: new Date()
        }
      });

      // Try PayChangu Payout API
      try {
        const payoutResult = await this.initiatePaychanguPayout({
          txRef: withdrawal.tx_ref!,
          amount: Number(withdrawal.net_amount),
          phone: withdrawal.recipient_phone,
          name: withdrawal.recipient_name,
          provider: withdrawal.provider || 'airtel_mw',
        });

        if (payoutResult.success) {
          // Update withdrawal with payout reference
          const updatedWithdrawal = await prisma.withdrawals.update({
            where: { id: withdrawalId },
            data: {
              payout_reference: payoutResult.reference,
              status: 'COMPLETED',
              completed_at: new Date(),
              updated_at: new Date()
            }
          });

          // Update transaction status
          if (withdrawal.transaction_id) {
            await prisma.transactions.update({
              where: { id: withdrawal.transaction_id },
              data: { status: 'COMPLETED' }
            });
          }

          console.log(`Withdrawal completed: ${withdrawal.tx_ref}`);
          return { success: true, withdrawal: updatedWithdrawal };
        } else {
          // Payout failed - revert wallet balance
          await this.revertWithdrawal(withdrawalId, payoutResult.error || 'Payout failed');
          return { success: false, error: payoutResult.error, errorCode: 'PAYOUT_FAILED' };
        }
      } catch (payoutError: any) {
        console.error('PayChangu payout error:', payoutError);
        
        // For now, mark as needing manual processing
        await prisma.withdrawals.update({
          where: { id: withdrawalId },
          data: {
            status: 'PENDING', // Keep pending for manual processing
            failure_reason: `API error: ${payoutError.message}. Needs manual processing.`,
            updated_at: new Date()
          }
        });

        return { 
          success: false, 
          error: 'Payout API unavailable. Withdrawal queued for manual processing.',
          errorCode: 'API_UNAVAILABLE'
        };
      }
    } catch (error: any) {
      console.error('Process withdrawal error:', error);
      return { success: false, error: error.message, errorCode: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Initiate PayChangu Payout (Disbursement)
   * Note: This is a placeholder - actual API may differ
   */
  private async initiatePaychanguPayout(data: {
    txRef: string;
    amount: number;
    phone: string;
    name: string;
    provider: string;
  }): Promise<{ success: boolean; reference?: string; error?: string }> {
    try {
      // PayChangu Payout API endpoint (hypothetical)
      // Real endpoint would be documented by PayChangu
      const response = await axios.post<PaychanguPayoutResponse>(
        `${this.apiBase}/payout`,
        {
          tx_ref: data.txRef,
          amount: data.amount,
          currency: 'MWK',
          phone_number: data.phone,
          recipient_name: data.name,
          network: data.provider, // airtel_mw, tnm_mw
          narration: `Sankha seller payout - ${data.txRef}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          reference: response.data.data?.reference || response.data.data?.tx_ref,
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Payout failed',
        };
      }
    } catch (error: any) {
      // If PayChangu doesn't have payout API or it's not configured
      if (error.response?.status === 404 || error.response?.status === 403) {
        throw new Error('PayChangu payout API not available');
      }
      throw error;
    }
  }

  /**
   * Revert a failed withdrawal - restore wallet balance
   */
  async revertWithdrawal(withdrawalId: string, reason: string): Promise<void> {
    const withdrawal = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId }
    });

    if (!withdrawal) return;

    await prisma.$transaction([
      // Update withdrawal status
      prisma.withdrawals.update({
        where: { id: withdrawalId },
        data: {
          status: 'FAILED',
          failed_at: new Date(),
          failure_reason: reason,
          updated_at: new Date()
        }
      }),
      // Revert transaction
      prisma.transactions.update({
        where: { id: withdrawal.transaction_id! },
        data: { status: 'FAILED' }
      }),
      // Restore wallet balance
      prisma.shops.update({
        where: { id: withdrawal.shop_id },
        data: {
          wallet_balance: withdrawal.balance_before,
          updated_at: new Date()
        }
      })
    ]);

    console.log(`Withdrawal reverted: ${withdrawal.tx_ref}, reason: ${reason}`);
  }

  /**
   * Cancel a pending withdrawal
   */
  async cancelWithdrawal(withdrawalId: string, userId: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId },
      include: { shops: { select: { owner_id: true } } }
    });

    if (!withdrawal) {
      return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    }

    // Check ownership
    if (withdrawal.shops.owner_id !== userId) {
      return { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' };
    }

    if (withdrawal.status !== 'PENDING') {
      return { success: false, error: `Cannot cancel withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };
    }

    await this.revertWithdrawal(withdrawalId, 'Cancelled by user');

    // Update to CANCELLED
    const cancelled = await prisma.withdrawals.update({
      where: { id: withdrawalId },
      data: { status: 'CANCELLED' }
    });

    return { success: true, withdrawal: cancelled };
  }

  /**
   * Get withdrawal by ID
   */
  async getWithdrawal(withdrawalId: string) {
    return prisma.withdrawals.findUnique({
      where: { id: withdrawalId },
      include: {
        shops: { select: { id: true, name: true } },
        transaction: true
      }
    });
  }

  /**
   * Get shop's withdrawal history
   */
  async getShopWithdrawals(shopId: string, options?: {
    status?: withdrawal_status;
    page?: number;
    limit?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.withdrawalsWhereInput = {
      shop_id: shopId,
      ...(options?.status && { status: options.status })
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawals.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.withdrawals.count({ where })
    ]);

    return {
      withdrawals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get all pending withdrawals (for admin processing)
   */
  async getPendingWithdrawals() {
    return prisma.withdrawals.findMany({
      where: { status: 'PENDING' },
      include: {
        shops: { select: { id: true, name: true, owner_id: true } }
      },
      orderBy: { created_at: 'asc' }
    });
  }

  /**
   * Admin: Manually complete a withdrawal
   */
  async adminCompleteWithdrawal(withdrawalId: string, reference: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId }
    });

    if (!withdrawal) {
      return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    }

    if (!['PENDING', 'PROCESSING'].includes(withdrawal.status)) {
      return { success: false, error: `Cannot complete withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };
    }

    const [updatedWithdrawal] = await prisma.$transaction([
      prisma.withdrawals.update({
        where: { id: withdrawalId },
        data: {
          status: 'COMPLETED',
          payout_reference: reference,
          completed_at: new Date(),
          updated_at: new Date()
        }
      }),
      prisma.transactions.update({
        where: { id: withdrawal.transaction_id! },
        data: { status: 'COMPLETED', payout_reference: reference }
      })
    ]);

    console.log(`Withdrawal manually completed by admin: ${withdrawal.tx_ref}`);
    return { success: true, withdrawal: updatedWithdrawal };
  }

  /**
   * Admin: Manually fail a withdrawal
   */
  async adminFailWithdrawal(withdrawalId: string, reason: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId }
    });

    if (!withdrawal) {
      return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    }

    if (!['PENDING', 'PROCESSING'].includes(withdrawal.status)) {
      return { success: false, error: `Cannot fail withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };
    }

    await this.revertWithdrawal(withdrawalId, reason);
    
    const updated = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId }
    });

    return { success: true, withdrawal: updated };
  }
}

export const withdrawalService = new WithdrawalService();
