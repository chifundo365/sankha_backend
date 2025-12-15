import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { paychanguConfig } from '../config/paychangu.config';
import { payment_status, payment_verified_by, Prisma } from '../../generated/prisma';

// Types
export interface InitiatePaymentData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  amount: number;
  currency?: string;
  orderId?: string;
  metadata?: Record<string, any>;
}

export interface PaychanguPaymentResponse {
  status: string;
  message: string;
  data?: {
    checkout_url?: string;
    tx_ref?: string;
    data?: {
      checkout_url?: string;
      tx_ref?: string;
    };
  };
}

export interface PaychanguVerificationResponse {
  status: string;
  message: string;
  data?: {
    status: string;
    tx_ref: string;
    amount: number;
    currency: string;
    charges?: number;
    reference?: string;
    authorization?: {
      channel?: string;
      card_number?: string;
      expiry?: string;
      brand?: string;
      provider?: string;
      mobile_number?: string;
      completed_at?: string;
    };
    amount_split?: Record<string, any>;
    number_of_attempts?: number;
  };
}

export interface WebhookPayload {
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  charge?: number;
  reference?: string;
  authorization?: {
    channel?: string;
    card_number?: string;
    expiry?: string;
    brand?: string;
    provider?: string;
    mobile_number?: string;
    completed_at?: string;
  };
  amount_split?: {
    amount_received_by_merchant?: number;
  };
}

/**
 * PayChangu Payment Service
 */
class PaymentService {
  private apiBase: string;
  private secretKey: string;
  private webhookSecretKey: string;

  constructor() {
    this.apiBase = paychanguConfig.apiBase;
    this.secretKey = paychanguConfig.secretKey;
    this.webhookSecretKey = paychanguConfig.webhookSecretKey;
  }

  /**
   * Generate unique transaction reference
   */
  generateTxRef(): string {
    return uuidv4();
  }

  /**
   * Initiate a payment with PayChangu
   */
  async initiatePayment(data: InitiatePaymentData) {
    const txRef = this.generateTxRef();
    const currency = data.currency || paychanguConfig.defaultCurrency;

    console.log('Initiating payment with reference:', txRef);

    try {
      const response = await axios.post<PaychanguPaymentResponse>(
        `${this.apiBase}/payment`,
        {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone,
          amount: data.amount,
          currency,
          tx_ref: txRef,
          callback_url: paychanguConfig.callbackUrl,
          return_url: paychanguConfig.returnUrl,
          customization: {
            title: 'ShopTech Payment',
            description: 'Payment for products purchased on ShopTech',
          },
          metadata: data.metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const responseData = response.data.data;
      const checkoutUrl = responseData?.checkout_url || responseData?.data?.checkout_url;
      const finalTxRef = responseData?.tx_ref || responseData?.data?.tx_ref || txRef;

      // Calculate expiry time
      const expiredAt = new Date();
      expiredAt.setMinutes(expiredAt.getMinutes() + paychanguConfig.paymentExpiryMinutes);

      // Create payment record in database
      const payment = await prisma.payments.create({
        data: {
          order_id: data.orderId || null,
          payment_method: 'paychangu',
          provider: 'paychangu',
          amount: new Prisma.Decimal(data.amount),
          currency,
          status: 'PENDING',
          tx_ref: finalTxRef,
          checkout_url: checkoutUrl,
          customer_email: data.email,
          customer_phone: data.phone,
          customer_first_name: data.first_name,
          customer_last_name: data.last_name,
          expired_at: expiredAt,
          metadata: data.metadata as Prisma.JsonObject,
          raw_response: response.data as unknown as Prisma.JsonObject,
        },
      });

      console.log('Payment initiated successfully:', finalTxRef);

      return {
        success: true,
        payment,
        checkoutUrl,
        txRef: finalTxRef,
        expiresAt: expiredAt,
      };
    } catch (error: any) {
      console.error('Payment initiation error:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verify payment status with PayChangu
   */
  async verifyPaymentWithProvider(txRef: string): Promise<PaychanguVerificationResponse> {
    try {
      const response = await axios.get<PaychanguVerificationResponse>(
        `${this.apiBase}/verify-payment/${txRef}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      console.log(`Transaction verification successful for tx_ref: ${txRef}`);
      return response.data;
    } catch (error: any) {
      console.error(`Payment verification failed for tx_ref: ${txRef}`, error.response?.data || error.message);

      // PayChangu sometimes returns HTTP 400 with valid payment data
      if (error?.response?.status === 400) {
        const paymentData = error.response.data?.data;
        if (paymentData && paymentData.status && paymentData.tx_ref) {
          console.log(`PayChangu 400 response contains valid payment data for ${txRef}`);
          return error.response.data;
        }
      }

      throw error;
    }
  }

  /**
   * Verify and update payment status
   */
  async verifyPayment(txRef: string, verifiedBy: payment_verified_by = 'VERIFY_ENDPOINT') {
    const payment = await prisma.payments.findUnique({
      where: { tx_ref: txRef },
    });

    if (!payment) {
      throw new Error('Payment record not found');
    }

    // Already completed
    if (payment.status === 'PAID') {
      return { success: true, payment, alreadyVerified: true };
    }

    if (payment.status === 'FAILED') {
      return { success: false, payment, message: 'Payment already failed' };
    }

    try {
      const verification = await this.verifyPaymentWithProvider(txRef);
      const txData = verification.data;

      if (!txData) {
        throw new Error('Verification failed - no data returned');
      }

      // Map PayChangu status to our status
      const newStatus = this.mapPaychanguStatus(txData.status);

      // Update payment record
      const updatedPayment = await prisma.payments.update({
        where: { tx_ref: txRef },
        data: {
          status: newStatus,
          amount: new Prisma.Decimal(txData.amount),
          currency: txData.currency,
          verified_at: newStatus !== 'PENDING' ? new Date() : null,
          verified_by: newStatus !== 'PENDING' ? verifiedBy : null,
          authorization: txData.authorization as Prisma.JsonObject,
          payment_reference: txData.reference,
          raw_response: verification as unknown as Prisma.JsonObject,
          updated_at: new Date(),
        },
      });

      // Handle order status based on payment result
      if (newStatus === 'PAID') {
        // Confirm all orders linked to this payment
        await this.confirmPaymentOrders(txRef);
      } else if (newStatus === 'FAILED') {
        // Restore stock for failed payments
        await this.handleFailedPayment(txRef, 'Payment failed');
      }

      return {
        success: newStatus === 'PAID',
        payment: updatedPayment,
        providerData: txData,
        statusChanged: payment.status !== newStatus,
      };
    } catch (error: any) {
      console.error(`Verification error for ${txRef}:`, error.message);

      // Handle failed verification
      if (error?.response?.status === 400 || error?.response?.status === 404) {
        const updatedPayment = await prisma.payments.update({
          where: { tx_ref: txRef },
          data: {
            status: 'FAILED',
            verified_at: new Date(),
            verified_by: verifiedBy,
            updated_at: new Date(),
          },
        });

        return {
          success: false,
          payment: updatedPayment,
          message: 'Payment verification failed',
        };
      }

      throw error;
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(signature: string, payload: string): boolean {
    if (!signature) return false;

    const hash = crypto
      .createHmac('sha256', this.webhookSecretKey)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Process webhook notification
   */
  async processWebhook(signature: string, rawPayload: string) {
    // Validate signature
    if (!this.validateWebhookSignature(signature, rawPayload)) {
      console.error('Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }

    const webhookData: WebhookPayload = JSON.parse(rawPayload);
    console.log('Webhook received for:', webhookData.tx_ref);

    const payment = await prisma.payments.findUnique({
      where: { tx_ref: webhookData.tx_ref },
    });

    if (!payment) {
      console.error(`Payment not found for tx_ref: ${webhookData.tx_ref}`);
      throw new Error('Payment record not found');
    }

    // Verify with PayChangu API
    const verificationResult = await this.verifyPayment(webhookData.tx_ref, 'WEBHOOK');

    // Cross-check webhook data with verification
    if (verificationResult.providerData) {
      const txData = verificationResult.providerData;

      if (txData.status !== webhookData.status) {
        console.error(`Status mismatch: Webhook=${webhookData.status}, Verification=${txData.status}`);
      }

      if (Math.abs(txData.amount - webhookData.amount) > 1) {
        console.error(`Amount mismatch: Webhook=${webhookData.amount}, Verification=${txData.amount}`);
        throw new Error('Amount verification failed');
      }
    }

    return verificationResult;
  }

  /**
   * Get payment by transaction reference
   */
  async getPaymentByTxRef(txRef: string) {
    return prisma.payments.findUnique({
      where: { tx_ref: txRef },
      include: { orders: true },
    });
  }

  /**
   * Get payments by order ID
   */
  async getPaymentsByOrderId(orderId: string) {
    return prisma.payments.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get user's payments through their orders
   */
  async getUserPayments(userId: string) {
    return prisma.payments.findMany({
      where: {
        orders: {
          buyer_id: userId,
        },
      },
      include: { orders: true },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Create payment report
   */
  async createPaymentReport(data: {
    txRef: string;
    email: string;
    status: string;
    message: string;
  }) {
    const payment = await prisma.payments.findUnique({
      where: { tx_ref: data.txRef },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    return prisma.payment_reports.create({
      data: {
        payment_id: payment.id,
        tx_ref: data.txRef,
        email: data.email,
        status: data.status,
        message: data.message,
      },
    });
  }

  /**
   * Get pending payments that need verification
   */
  async getPendingPayments() {
    return prisma.payments.findMany({
      where: {
        status: 'PENDING',
        expired_at: { gt: new Date() },
      },
    });
  }

  /**
   * Get expired pending payments
   */
  async getExpiredPayments() {
    return prisma.payments.findMany({
      where: {
        status: 'PENDING',
        expired_at: { lte: new Date() },
      },
    });
  }

  /**
   * Mark a specific payment as failed
   */
  async markPaymentAsFailed(txRef: string, verifiedBy: payment_verified_by) {
    return prisma.payments.update({
      where: { tx_ref: txRef },
      data: {
        status: 'FAILED',
        verified_at: new Date(),
        verified_by: verifiedBy,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Mark expired payments as failed and restore stock
   */
  async markExpiredPaymentsAsFailed() {
    const expiredPayments = await this.getExpiredPayments();
    const results = [];

    for (const payment of expiredPayments) {
      try {
        // Update payment status
        const updatedPayment = await prisma.payments.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            verified_at: new Date(),
            verified_by: 'BACKGROUND_JOB',
            updated_at: new Date(),
          },
        });

        // Restore stock and cancel order if exists
        if (payment.order_id) {
          await this.restoreOrderStock(payment.order_id, 'Payment expired');
        }

        results.push({ txRef: payment.tx_ref, status: 'marked_failed' });
        console.log(`Expired payment marked as failed: ${payment.tx_ref}`);
      } catch (error) {
        console.error(`Error marking payment ${payment.tx_ref} as failed:`, error);
        results.push({ txRef: payment.tx_ref, status: 'error' });
      }
    }

    return results;
  }

  /**
   * Restore stock for an order and update order status to CANCELLED
   */
  async restoreOrderStock(orderId: string, reason: string) {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: { order_items: true },
    });

    if (!order) {
      console.error(`Order not found for stock restoration: ${orderId}`);
      return null;
    }

    // Only restore stock for orders that haven't been confirmed/shipped
    if (!['PENDING_PAYMENT', 'PENDING'].includes(order.status || '')) {
      console.log(`Order ${orderId} status is ${order.status}, skipping stock restoration`);
      return order;
    }

    // Restore stock for each item (trigger handles logging with custom reason)
    for (const item of order.order_items) {
      if (item.shop_product_id) {
        const stockReason = `Stock restored - ${reason} for order ${order.order_number}`;
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${stockReason.replace(/'/g, "''")}'`);
          await tx.shop_products.update({
            where: { id: item.shop_product_id! },
            data: {
              stock_quantity: {
                increment: item.quantity,
              },
            },
          });
        });
      }
    }

    // Update order status to CANCELLED
    const updatedOrder = await prisma.orders.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        updated_at: new Date(),
      },
    });

    console.log(`Stock restored and order cancelled: ${order.order_number}`);
    return updatedOrder;
  }

  /**
   * Confirm all orders linked to a payment (used after successful payment)
   */
  async confirmPaymentOrders(txRef: string) {
    const payment = await prisma.payments.findUnique({
      where: { tx_ref: txRef },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Get all orders linked to this tx_ref (could be multiple for multi-shop checkout)
    const linkedPayments = await prisma.payments.findMany({
      where: { tx_ref: txRef },
      include: { orders: true },
    });

    const confirmedOrders = [];

    for (const p of linkedPayments) {
      if (p.order_id) {
        const order = await prisma.orders.findUnique({
          where: { id: p.order_id },
        });

        if (order && order.status === 'PENDING_PAYMENT') {
          const confirmedOrder = await prisma.orders.update({
            where: { id: p.order_id },
            data: {
              status: 'CONFIRMED',
              updated_at: new Date(),
            },
          });
          confirmedOrders.push(confirmedOrder);
          console.log(`Order confirmed after payment: ${order.order_number}`);
        }
      }
    }

    return confirmedOrders;
  }

  /**
   * Handle failed payment - restore stock for all linked orders
   */
  async handleFailedPayment(txRef: string, reason: string) {
    const linkedPayments = await prisma.payments.findMany({
      where: { tx_ref: txRef },
    });

    const results = [];

    for (const payment of linkedPayments) {
      if (payment.order_id) {
        const result = await this.restoreOrderStock(payment.order_id, reason);
        results.push({
          orderId: payment.order_id,
          restored: result !== null,
        });
      }
    }

    return results;
  }

  /**
   * Map PayChangu status to our payment status
   */
  private mapPaychanguStatus(status: string): payment_status {
    switch (status.toLowerCase()) {
      case 'success':
      case 'successful':
        return 'PAID';
      case 'failed':
      case 'failure':
        return 'FAILED';
      case 'pending':
      default:
        return 'PENDING';
    }
  }
}

export const paymentService = new PaymentService();
