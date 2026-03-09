import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { paychanguConfig } from '../config/paychangu.config';
import { Prisma, withdrawal_status } from '../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { sendSms } from './sms.service';

// ─── CONSTANTS ─────────────────────────────────────────────────────
const WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 5000,
  MAX_AMOUNT: 5000000,
  PAYCHANGU_FEE_PERCENT: 1.7,
  BANK_FEE_MWK: 700,
  CACHE_TTL_HOURS: 24,
};

const MOMO_NAMES = ['Airtel Money', 'TNM Mpamba'];

// ─── TYPES ─────────────────────────────────────────────────────────
export interface PayoutOperator {
  id: string;
  uuid: string;
  name: string;
  type: 'MOBILE_MONEY' | 'BANK';
  is_active: boolean;
}

export interface WithdrawalResult {
  success: boolean;
  withdrawal?: any;
  error?: string;
  errorCode?: string;
}

// ─── WITHDRAWAL SERVICE ────────────────────────────────────────────
class WithdrawalService {
  private apiBase: string;
  private secretKey: string;

  constructor() {
    this.apiBase = paychanguConfig.apiBase;
    this.secretKey = paychanguConfig.secretKey;
  }

  // ─── STEP 1: DESTINATION FETCHING & CACHING ─────────────────────

  /**
   * Fetch payout destinations from cache or PayChangu API.
   * Uses payout_operators table as a 24-hour cache.
   */
  async getPayoutDestinations(): Promise<PayoutOperator[]> {
    const cutoff = new Date(Date.now() - WITHDRAWAL_CONFIG.CACHE_TTL_HOURS * 60 * 60 * 1000);
    const cachedCount = await prisma.payout_operators.count({
      where: { cached_at: { gte: cutoff } },
    });

    if (cachedCount > 0) {
      const operators = await prisma.payout_operators.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' },
      });
      return operators.map(op => ({
        id: op.id,
        uuid: op.uuid,
        name: op.name,
        type: op.type as 'MOBILE_MONEY' | 'BANK',
        is_active: op.is_active,
      }));
    }

    // Cache is stale or empty — fetch from PayChangu
    try {
      const response = await axios.get(`${this.apiBase}/banks`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      if (response.data?.status !== 'success' || !Array.isArray(response.data?.data)) {
        throw new Error('Unexpected response from PayChangu banks endpoint');
      }

      const now = new Date();
      for (const item of response.data.data) {
        const inferredType = MOMO_NAMES.some(m => item.name?.includes(m))
          ? 'MOBILE_MONEY'
          : 'BANK';

        await prisma.payout_operators.upsert({
          where: { uuid: item.uuid },
          create: {
            uuid: item.uuid,
            name: item.name,
            type: inferredType,
            is_active: true,
            cached_at: now,
          },
          update: {
            name: item.name,
            type: inferredType,
            is_active: true,
            cached_at: now,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch payout destinations from PayChangu:', error.message);
    }

    const operators = await prisma.payout_operators.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });

    return operators.map(op => ({
      id: op.id,
      uuid: op.uuid,
      name: op.name,
      type: op.type as 'MOBILE_MONEY' | 'BANK',
      is_active: op.is_active,
    }));
  }

  /**
   * Look up a single payout destination by PayChangu uuid.
   */
  async getDestinationByUuid(uuid: string): Promise<PayoutOperator | null> {
    const destinations = await this.getPayoutDestinations();
    return destinations.find(d => d.uuid === uuid) || null;
  }

  // ─── STEP 2: PAYOUT INITIATION (STUBS) ──────────────────────────

  /**
   * Initiate a payout via PayChangu.
   *
   * CRITICAL: account_number and account_name are passed through to the
   * API call only — they are NEVER stored in the database or logged.
   */
  async initiatePayout(params: {
    destination_uuid: string;
    account_number: string;
    account_name: string;
    amount: number;
    withdrawal_id: string;
    type: 'MOBILE_MONEY' | 'BANK';
  }): Promise<{ charge_id: string }> {
    // TODO: MANUAL COMPLETION REQUIRED — Replace this stub with real PayChangu payout API calls.
    //
    // For MOBILE_MONEY:
    //   Endpoint: TODO — confirm from https://developer.paychangu.com/reference/mobile-money-payout
    //   Payload:  TODO — confirm field names (likely: uuid, mobile, amount, etc.)
    //   Example:
    //     const response = await axios.post(`${this.apiBase}/mobile-money/payouts`, {
    //       uuid: params.destination_uuid,
    //       mobile: params.account_number,
    //       amount: params.amount,
    //     }, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    //
    // For BANK:
    //   Endpoint: TODO — confirm from https://developer.paychangu.com/reference/bank-payout
    //   Payload:  TODO — confirm field names (likely: uuid, account_number, account_name, amount, etc.)
    //   Example:
    //     const response = await axios.post(`${this.apiBase}/bank/payouts`, {
    //       uuid: params.destination_uuid,
    //       account_number: params.account_number,
    //       account_name: params.account_name,
    //       amount: params.amount,
    //     }, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    //
    // Both should:
    //   - Use Authorization: Bearer {PAYCHANGU_SECRET_KEY}
    //   - Return charge_id from response
    //   - Throw error on non-success status

    // STUB IMPLEMENTATION (replace when API details confirmed):
    return { charge_id: `STUB-${params.withdrawal_id}-${Date.now()}` };
  }

  // ─── STEP 3: PAYOUT VERIFICATION (STUBS) ────────────────────────

  /**
   * Verify payout status with PayChangu.
   */
  async verifyPayout(params: {
    charge_id: string;
    type: 'MOBILE_MONEY' | 'BANK';
  }): Promise<'SUCCESS' | 'FAILED' | 'PENDING'> {
    // TODO: MANUAL COMPLETION REQUIRED — Replace this stub with real PayChangu verification calls.
    //
    // For MOBILE_MONEY:
    //   Endpoint: TODO — confirm from https://developer.paychangu.com/reference/single-charge-details-copy
    //   GET https://api.paychangu.com/[endpoint]/{charge_id}
    //
    // For BANK:
    //   Endpoint: TODO — confirm from https://developer.paychangu.com/reference/single-bank-payout-details
    //   GET https://api.paychangu.com/[endpoint]/{charge_id}
    //
    // Both should:
    //   - Use Authorization: Bearer {PAYCHANGU_SECRET_KEY}
    //   - Map response status to: 'SUCCESS' | 'FAILED' | 'PENDING'
    //
    // Example:
    //   const response = await axios.get(
    //     `${this.apiBase}/[endpoint]/${params.charge_id}`,
    //     { headers: { Authorization: `Bearer ${this.secretKey}` } }
    //   );
    //   const status = response.data?.data?.status;
    //   if (status === 'success') return 'SUCCESS';
    //   if (status === 'failed') return 'FAILED';
    //   return 'PENDING';

    // STUB IMPLEMENTATION (replace when API details confirmed):
    return 'PENDING';
  }

  // ─── FEE CALCULATION ────────────────────────────────────────────

  calculateWithdrawalFees(amount: number, type: 'MOBILE_MONEY' | 'BANK'): {
    paychanguFee: number;
    bankFee: number;
    netAmount: number;
  } {
    const paychanguFee = Math.ceil(amount * (WITHDRAWAL_CONFIG.PAYCHANGU_FEE_PERCENT / 100));
    const bankFee = type === 'BANK' ? WITHDRAWAL_CONFIG.BANK_FEE_MWK : 0;
    const netAmount = amount - paychanguFee - bankFee;
    return { paychanguFee, bankFee, netAmount };
  }

  // ─── DEBT DEDUCTION ─────────────────────────────────────────────

  async handleDebtDeduction(params: {
    shop_id: string;
    requested_amount: number;
    seller_debt_balance: number;
  }): Promise<{
    proceed: boolean;
    adjusted_amount: number;
    debt_deducted: number;
    sms_message: string;
  }> {
    const { requested_amount, seller_debt_balance } = params;

    if (seller_debt_balance <= 0) {
      return {
        proceed: true,
        adjusted_amount: requested_amount,
        debt_deducted: 0,
        sms_message: '',
      };
    }

    if (seller_debt_balance >= requested_amount) {
      const remaining = seller_debt_balance - requested_amount;
      return {
        proceed: false,
        adjusted_amount: 0,
        debt_deducted: requested_amount,
        sms_message:
          `Your withdrawal of MWK ${requested_amount.toLocaleString()} was applied to your ` +
          `outstanding balance of MWK ${seller_debt_balance.toLocaleString()}. ` +
          `Remaining debt: MWK ${remaining.toLocaleString()}`,
      };
    }

    const adjusted = requested_amount - seller_debt_balance;
    return {
      proceed: true,
      adjusted_amount: adjusted,
      debt_deducted: seller_debt_balance,
      sms_message:
        `MWK ${seller_debt_balance.toLocaleString()} deducted from your withdrawal for a previous ` +
        `refund. You will receive your payout from MWK ${adjusted.toLocaleString()} after fees.`,
    };
  }

  // ─── MAIN ORCHESTRATOR ──────────────────────────────────────────

  /**
   * Full withdrawal flow: validate → debt → fees → reserve → payout → SMS
   *
   * CRITICAL: account_number and account_name are NEVER persisted.
   * They exist only as function parameters passed to the PayChangu API call.
   */
  async processWithdrawal(params: {
    shop_id: string;
    amount: number;
    destination_uuid: string;
    account_number: string;
    account_name: string;
  }): Promise<void> {
    const { shop_id, amount, destination_uuid, account_number, account_name } = params;

    // ── 1. VALIDATE ──────────────────────────────────────────────
    const shop = await prisma.shops.findUnique({
      where: { id: shop_id },
      select: {
        id: true,
        name: true,
        wallet_balance: true,
        seller_debt_balance: true,
        owner_id: true,
        phone: true,
      },
    });

    if (!shop) throw new Error('Shop not found');

    const walletBalance = Number(shop.wallet_balance);
    if (amount > walletBalance) throw new Error('Insufficient wallet balance');
    if (amount < WITHDRAWAL_CONFIG.MIN_AMOUNT) throw new Error('Minimum withdrawal is MWK 5,000');
    if (amount > WITHDRAWAL_CONFIG.MAX_AMOUNT) throw new Error('Maximum withdrawal is MWK 5,000,000');
    if (!destination_uuid) throw new Error('Please select a payout destination');
    if (!account_number) throw new Error('Account number is required');
    if (!account_name) throw new Error('Account name is required');

    // ── 2. FETCH DESTINATION ─────────────────────────────────────
    const destination = await this.getDestinationByUuid(destination_uuid);
    if (!destination) throw new Error('Invalid payout destination');

    // ── 3. HANDLE DEBT DEDUCTION ─────────────────────────────────
    const debtResult = await this.handleDebtDeduction({
      shop_id,
      requested_amount: amount,
      seller_debt_balance: Number(shop.seller_debt_balance),
    });

    if (debtResult.debt_deducted > 0) {
      await prisma.$transaction([
        prisma.shops.update({
          where: { id: shop_id },
          data: {
            seller_debt_balance: {
              decrement: new Prisma.Decimal(debtResult.debt_deducted),
            },
          },
        }),
        ...(debtResult.proceed
          ? []
          : [
              prisma.withdrawals.create({
                data: {
                  shop_id,
                  amount: new Prisma.Decimal(amount),
                  fee: new Prisma.Decimal(0),
                  net_amount: new Prisma.Decimal(0),
                  status: 'DEBT_CLEARED' as withdrawal_status,
                  payout_method: destination.type,
                  destination_uuid,
                  debt_deducted: new Prisma.Decimal(debtResult.debt_deducted),
                  balance_before: new Prisma.Decimal(walletBalance),
                  balance_after: new Prisma.Decimal(walletBalance),
                },
              }),
            ]),
      ]);

      if (debtResult.sms_message && shop.phone) {
        try { await sendSms(shop.phone, debtResult.sms_message); } catch (_) {}
      }

      if (!debtResult.proceed) return;
    }

    const adjustedAmount = debtResult.adjusted_amount;

    // ── 4. CALCULATE FEES ────────────────────────────────────────
    const fees = this.calculateWithdrawalFees(adjustedAmount, destination.type as 'MOBILE_MONEY' | 'BANK');

    // ── 5. RESERVE FUNDS ─────────────────────────────────────────
    const balanceBefore = new Decimal(walletBalance.toString());
    const balanceAfter = balanceBefore.minus(adjustedAmount);
    const txRef = `PAYOUT-${uuidv4()}`;

    let withdrawal: any;
    try {
      [withdrawal] = await prisma.$transaction([
        prisma.withdrawals.create({
          data: {
            shop_id,
            amount: new Prisma.Decimal(adjustedAmount),
            fee: new Prisma.Decimal(fees.paychanguFee + fees.bankFee),
            net_amount: new Prisma.Decimal(fees.netAmount),
            paychangu_fee: new Prisma.Decimal(fees.paychanguFee),
            bank_fee: new Prisma.Decimal(fees.bankFee),
            debt_deducted: new Prisma.Decimal(debtResult.debt_deducted),
            status: 'PROCESSING',
            payout_method: destination.type,
            destination_uuid,
            tx_ref: txRef,
            balance_before: new Prisma.Decimal(balanceBefore.toString()),
            balance_after: new Prisma.Decimal(balanceAfter.toString()),
          },
        }),
        prisma.shops.update({
          where: { id: shop_id },
          data: {
            wallet_balance: new Prisma.Decimal(balanceAfter.toString()),
            updated_at: new Date(),
          },
        }),
      ]);
    } catch (err: any) {
      throw new Error('Failed to reserve withdrawal funds: ' + err.message);
    }

    // ── 6. INITIATE PAYOUT ───────────────────────────────────────
    try {
      const { charge_id } = await this.initiatePayout({
        destination_uuid,
        account_number,
        account_name,
        amount: fees.netAmount,
        withdrawal_id: withdrawal.id,
        type: destination.type as 'MOBILE_MONEY' | 'BANK',
      });

      await prisma.withdrawals.update({
        where: { id: withdrawal.id },
        data: { charge_id, updated_at: new Date() },
      });
    } catch (payoutError: any) {
      // Payout failed — restore wallet balance and mark withdrawal FAILED
      await prisma.$transaction([
        prisma.shops.update({
          where: { id: shop_id },
          data: {
            wallet_balance: { increment: new Prisma.Decimal(adjustedAmount) },
            updated_at: new Date(),
          },
        }),
        prisma.withdrawals.update({
          where: { id: withdrawal.id },
          data: {
            status: 'FAILED',
            failed_at: new Date(),
            failure_reason: payoutError.message || 'Payout initiation failed',
            updated_at: new Date(),
          },
        }),
      ]);

      if (shop.phone) {
        try {
          await sendSms(
            shop.phone,
            `Your withdrawal of MWK ${adjustedAmount.toLocaleString()} failed. Your balance has been restored. Please try again or contact support.`,
          );
        } catch (_) {}
      }
      return;
    }

    // ── 7. SMS SELLER ────────────────────────────────────────────
    if (shop.phone) {
      try {
        await sendSms(
          shop.phone,
          `Your withdrawal of MWK ${adjustedAmount.toLocaleString()} is being processed. ` +
            `You will receive MWK ${fees.netAmount.toLocaleString()} after fees. ` +
            `We will notify you when it completes.`,
        );
      } catch (_) {}
    }
  }

  // ─── LEGACY HELPERS (kept for admin & existing endpoints) ───────

  generateTxRef(): string {
    return `PAYOUT-${uuidv4()}`;
  }

  calculateFee(amount: number): { fee: number; netAmount: number } {
    const paychanguFee = Math.ceil(amount * (WITHDRAWAL_CONFIG.PAYCHANGU_FEE_PERCENT / 100));
    return { fee: paychanguFee, netAmount: amount - paychanguFee };
  }

  async getWithdrawal(withdrawalId: string) {
    return prisma.withdrawals.findUnique({
      where: { id: withdrawalId },
      include: {
        shops: { select: { id: true, name: true } },
        transaction: true,
      },
    });
  }

  async getShopWithdrawals(
    shopId: string,
    options?: { status?: withdrawal_status; page?: number; limit?: number },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.withdrawalsWhereInput = {
      shop_id: shopId,
      ...(options?.status && { status: options.status }),
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawals.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.withdrawals.count({ where }),
    ]);

    return {
      withdrawals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getPendingWithdrawals() {
    return prisma.withdrawals.findMany({
      where: { status: 'PENDING' },
      include: { shops: { select: { id: true, name: true, owner_id: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async revertWithdrawal(withdrawalId: string, reason: string): Promise<void> {
    const withdrawal = await prisma.withdrawals.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) return;

    await prisma.$transaction([
      prisma.withdrawals.update({
        where: { id: withdrawalId },
        data: {
          status: 'FAILED',
          failed_at: new Date(),
          failure_reason: reason,
          updated_at: new Date(),
        },
      }),
      ...(withdrawal.transaction_id
        ? [prisma.transactions.update({ where: { id: withdrawal.transaction_id }, data: { status: 'FAILED' } })]
        : []),
      prisma.shops.update({
        where: { id: withdrawal.shop_id },
        data: { wallet_balance: withdrawal.balance_before, updated_at: new Date() },
      }),
    ]);
  }

  async cancelWithdrawal(withdrawalId: string, userId: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({
      where: { id: withdrawalId },
      include: { shops: { select: { owner_id: true } } },
    });
    if (!withdrawal) return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    if (withdrawal.shops.owner_id !== userId) return { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' };
    if (withdrawal.status !== 'PENDING') return { success: false, error: `Cannot cancel withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };

    await this.revertWithdrawal(withdrawalId, 'Cancelled by user');
    const cancelled = await prisma.withdrawals.update({
      where: { id: withdrawalId },
      data: { status: 'CANCELLED' },
    });
    return { success: true, withdrawal: cancelled };
  }

  async adminCompleteWithdrawal(withdrawalId: string, reference: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    if (!['PENDING', 'PROCESSING'].includes(withdrawal.status)) {
      return { success: false, error: `Cannot complete withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };
    }

    const [updatedWithdrawal] = await prisma.$transaction([
      prisma.withdrawals.update({
        where: { id: withdrawalId },
        data: { status: 'COMPLETED', payout_reference: reference, completed_at: new Date(), updated_at: new Date() },
      }),
      ...(withdrawal.transaction_id
        ? [prisma.transactions.update({ where: { id: withdrawal.transaction_id }, data: { status: 'COMPLETED', payout_reference: reference } })]
        : []),
    ]);
    return { success: true, withdrawal: updatedWithdrawal };
  }

  async adminFailWithdrawal(withdrawalId: string, reason: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawals.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) return { success: false, error: 'Withdrawal not found', errorCode: 'NOT_FOUND' };
    if (!['PENDING', 'PROCESSING'].includes(withdrawal.status)) {
      return { success: false, error: `Cannot fail withdrawal in ${withdrawal.status} status`, errorCode: 'INVALID_STATUS' };
    }
    await this.revertWithdrawal(withdrawalId, reason);
    const updated = await prisma.withdrawals.findUnique({ where: { id: withdrawalId } });
    return { success: true, withdrawal: updated };
  }
}

export const withdrawalService = new WithdrawalService();
