import axios from 'axios';
import prisma from '../prismaClient';
import { paychanguConfig } from '../config/paychangu.config';
import { Prisma } from '../../generated/prisma';
import { Decimal } from '../../generated/prisma/runtime/library';

export type RefundFault = 'BUYER' | 'SELLER' | 'PLATFORM';

export interface RefundRequestData {
  orderId: string;
  fault: RefundFault;
  reason: string;
  initiatedBy: string; // userId of who initiated the refund
}

export interface RefundResult {
  success: boolean;
  refundAmount?: Decimal;
  method?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Refund Service
 * Implements fault-based refund logic per Sankha Financial Blueprint Section 7.
 *
 * Fault logic:
 * - BUYER fault (e.g. buyer cancels after payment): Refund to PayChangu (original payment method).
 *   PayChangu fees are NOT recovered — buyer absorbs them.
 * - SELLER fault (e.g. seller cancels, out of stock after payment): Full amount credited to
 *   buyer's Sankha wallet (or PayChangu refund). Seller is debited for the loss.
 * - PLATFORM fault: Full refund via PayChangu. Sankha absorbs fees.
 */
class RefundService {
  private apiBase: string;
  private secretKey: string;

  constructor() {
    this.apiBase = paychanguConfig.apiBase;
    this.secretKey = paychanguConfig.secretKey;
  }

  /**
   * Process a refund for an order based on fault type
   */
  async processRefund(data: RefundRequestData): Promise<RefundResult> {
    try {
      const order = await prisma.orders.findUnique({
        where: { id: data.orderId },
        include: {
          payments: true,
          order_items: true,
          shops: { select: { id: true, wallet_balance: true, name: true } },
        },
      });

      if (!order) {
        return { success: false, error: 'Order not found', errorCode: 'ORDER_NOT_FOUND' };
      }

      // Find the PAID payment for this order
      const paidPayment = order.payments.find(p => p.status === 'PAID');
      if (!paidPayment) {
        return { success: false, error: 'No paid payment found for this order', errorCode: 'NO_PAID_PAYMENT' };
      }

      const refundAmount = new Decimal(paidPayment.amount);

      switch (data.fault) {
        case 'BUYER':
          return this.processBuyerFaultRefund(order, paidPayment, refundAmount, data);
        case 'SELLER':
          return this.processSellerFaultRefund(order, paidPayment, refundAmount, data);
        case 'PLATFORM':
          return this.processPlatformFaultRefund(order, paidPayment, refundAmount, data);
        default:
          return { success: false, error: 'Invalid fault type', errorCode: 'INVALID_FAULT' };
      }
    } catch (error: any) {
      console.error('Refund processing error:', error);
      return { success: false, error: error.message || 'Refund processing failed', errorCode: 'INTERNAL_ERROR' };
    }
  }

  /**
   * BUYER fault: Refund via PayChangu. Buyer absorbs gateway fees.
   */
  private async processBuyerFaultRefund(
    order: any,
    payment: any,
    refundAmount: Decimal,
    data: RefundRequestData
  ): Promise<RefundResult> {
    // Attempt PayChangu refund
    const payResult = await this.initiatePaychanguRefund(payment.tx_ref, Number(refundAmount));

    // Record the refund transaction regardless of PayChangu result
    await this.recordRefundTransaction(order, refundAmount, data, payResult.success ? 'COMPLETED' : 'PENDING');

    // Update payment status
    await prisma.payments.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });

    // Update order status
    await prisma.orders.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });

    return {
      success: true,
      refundAmount,
      method: 'paychangu_refund',
    };
  }

  /**
   * SELLER fault: Credit buyer via Sankha wallet mechanism + debit seller.
   * The seller's wallet is debited for the base_price portion they would have received.
   */
  private async processSellerFaultRefund(
    order: any,
    payment: any,
    refundAmount: Decimal,
    data: RefundRequestData
  ): Promise<RefundResult> {
    const shopId = order.shop_id;
    const shop = order.shops;

    // Calculate seller payout that would have been credited
    const sellerPortion = order.order_items.reduce((sum: Decimal, item: any) => {
      const basePrice = item.base_price ? new Decimal(item.base_price) : new Decimal(0);
      return sum.add(basePrice.mul(item.quantity));
    }, new Decimal(0));

    // Add delivery_fee to seller portion if applicable
    const deliveryFee = order.delivery_fee ? new Decimal(order.delivery_fee) : new Decimal(0);
    const totalSellerDebit = sellerPortion.add(deliveryFee);

    const currentBalance = new Decimal(shop?.wallet_balance || 0);
    const newBalance = currentBalance.minus(totalSellerDebit);

    // Use $transaction to atomically debit seller and record
    await prisma.$transaction([
      // Debit seller wallet (may go negative — recorded as debt)
      prisma.shops.update({
        where: { id: shopId },
        data: {
          wallet_balance: new Prisma.Decimal(newBalance.toString()),
          updated_at: new Date(),
        },
      }),
      // Record seller debit transaction
      prisma.transactions.create({
        data: {
          shop_id: shopId,
          type: 'REFUND',
          amount: new Prisma.Decimal(totalSellerDebit.negated().toString()),
          balance_before: new Prisma.Decimal(currentBalance.toString()),
          balance_after: new Prisma.Decimal(newBalance.toString()),
          status: 'COMPLETED',
          order_id: order.id,
          description: `Seller-fault refund debit for order #${order.order_number}`,
        },
      }),
    ]);

    // Also attempt PayChangu refund to return money to buyer
    await this.initiatePaychanguRefund(payment.tx_ref, Number(refundAmount));

    // Record refund transaction
    await this.recordRefundTransaction(order, refundAmount, data, 'COMPLETED');

    // Update payment and order status
    await prisma.payments.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });
    await prisma.orders.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });

    // ─── INCREMENT SELLER DEBT BALANCE ──────────────────────────
    // Seller absorbs: PayChangu inbound fee (3%) + PayChangu outbound refund fee (1.7%) + Sankha platform fee (3%)
    const displayPrice = Number(refundAmount);
    const paychanguInboundFee = displayPrice * 0.03;
    const paychanguOutboundRefundFee = displayPrice * 0.017;
    const sankhaPlatformFee = displayPrice * 0.03;
    const totalAbsorbed = new Decimal(
      Math.ceil(paychanguInboundFee + paychanguOutboundRefundFee + sankhaPlatformFee),
    );

    await prisma.shops.update({
      where: { id: order.shop_id },
      data: {
        seller_debt_balance: { increment: new Prisma.Decimal(totalAbsorbed.toString()) },
      },
    });

    await prisma.transactions.create({
      data: {
        shop_id: order.shop_id,
        type: 'ADJUSTMENT',
        amount: new Prisma.Decimal(totalAbsorbed.toString()),
        balance_before: new Prisma.Decimal(0),
        balance_after: new Prisma.Decimal(0),
        status: 'COMPLETED',
        order_id: order.id,
        description: `Seller fault refund debt — Order ${order.order_number}`,
      },
    });

    return {
      success: true,
      refundAmount,
      method: 'seller_debit_and_paychangu_refund',
    };
  }

  /**
   * PLATFORM fault: Full PayChangu refund. Sankha absorbs all fees.
   */
  private async processPlatformFaultRefund(
    order: any,
    payment: any,
    refundAmount: Decimal,
    data: RefundRequestData
  ): Promise<RefundResult> {
    // Attempt PayChangu refund
    const payResult = await this.initiatePaychanguRefund(payment.tx_ref, Number(refundAmount));

    // Record refund transaction
    await this.recordRefundTransaction(order, refundAmount, data, payResult.success ? 'COMPLETED' : 'PENDING');

    // Update payment and order status
    await prisma.payments.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });
    await prisma.orders.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', updated_at: new Date() },
    });

    return {
      success: true,
      refundAmount,
      method: 'platform_paychangu_refund',
    };
  }

  /**
   * Initiate a refund via PayChangu API
   */
  private async initiatePaychanguRefund(
    txRef: string,
    amount: number
  ): Promise<{ success: boolean; reference?: string; error?: string }> {
    try {
      const response = await axios.post(
        `${this.apiBase}/payment/refund`,
        {
          tx_ref: txRef,
          amount,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status === 'success') {
        console.log(`PayChangu refund initiated for ${txRef}`);
        return { success: true, reference: response.data.data?.reference };
      }
      return { success: false, error: response.data.message || 'Refund failed' };
    } catch (error: any) {
      console.error(`PayChangu refund API error for ${txRef}:`, error?.response?.data || error.message);
      // Don't throw — refund is recorded in our DB even if PayChangu call fails
      return { success: false, error: error.message };
    }
  }

  /**
   * Record refund transaction in our database
   */
  private async recordRefundTransaction(
    order: any,
    amount: Decimal,
    data: RefundRequestData,
    status: 'COMPLETED' | 'PENDING'
  ): Promise<void> {
    await prisma.transactions.create({
      data: {
        shop_id: order.shop_id,
        type: 'REFUND',
        amount: new Prisma.Decimal(amount.negated().toString()),
        balance_before: new Prisma.Decimal(0), // Informational; buyer-side
        balance_after: new Prisma.Decimal(0),
        status,
        order_id: order.id,
        description: `${data.fault} fault refund for order #${order.order_number}: ${data.reason}`,
      },
    });
  }
}

export const refundService = new RefundService();
