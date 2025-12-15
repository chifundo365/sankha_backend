import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { successResponse, errorResponse } from '../utils/response';

/**
 * Initiate a new payment
 * POST /api/payments/initiate
 */
export const initiatePayment = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, phone, amount, currency, orderId, metadata } = req.body;

    const result = await paymentService.initiatePayment({
      first_name,
      last_name,
      email,
      phone,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      orderId,
      metadata,
    });

    return successResponse(res, 'Payment initiated successfully', {
      txRef: result.txRef,
      checkoutUrl: result.checkoutUrl,
      expiresAt: result.expiresAt,
      payment: {
        id: result.payment.id,
        amount: result.payment.amount,
        currency: result.payment.currency,
        status: result.payment.status,
      },
    }, 201);
  } catch (error: any) {
    console.error('Payment initiation error:', error);
    
    if (error?.response?.data) {
      return errorResponse(
        res,
        error.response.data.message || 'Payment initiation failed',
        error.response.data,
        error.response.status || 500
      );
    }

    return errorResponse(res, 'Payment initiation failed', null, 500);
  }
};

/**
 * Verify payment status
 * POST /api/payments/verify
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { tx_ref } = req.body;

    const payment = await paymentService.getPaymentByTxRef(tx_ref);

    if (!payment) {
      return errorResponse(res, 'Payment not found', null, 404);
    }

    // If already verified
    if (payment.status === 'PAID') {
      return successResponse(res, 'Payment already verified', {
        status: payment.status,
        payment: {
          id: payment.id,
          txRef: payment.tx_ref,
          amount: payment.amount,
          currency: payment.currency,
          verifiedAt: payment.verified_at,
        },
      });
    }

    if (payment.status === 'FAILED') {
      return errorResponse(res, 'Payment failed', {
        status: payment.status,
        txRef: payment.tx_ref,
      }, 400);
    }

    // Verify with PayChangu
    const result = await paymentService.verifyPayment(tx_ref, 'VERIFY_ENDPOINT');

    if (result.success) {
      return successResponse(res, 'Payment verified successfully', {
        status: result.payment.status,
        payment: {
          id: result.payment.id,
          txRef: result.payment.tx_ref,
          amount: result.payment.amount,
          currency: result.payment.currency,
          verifiedAt: result.payment.verified_at,
        },
      });
    }

    // Still pending - return checkout URL if available
    if (result.payment.status === 'PENDING' && result.payment.checkout_url) {
      return successResponse(res, 'Payment pending', {
        status: result.payment.status,
        checkoutUrl: result.payment.checkout_url,
        payment: {
          id: result.payment.id,
          txRef: result.payment.tx_ref,
          amount: result.payment.amount,
          currency: result.payment.currency,
        },
      });
    }

    return errorResponse(res, result.message || 'Payment verification failed', {
      status: result.payment.status,
    }, 400);
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return errorResponse(res, 'Payment verification failed', null, 500);
  }
};

/**
 * Handle PayChangu webhook
 * POST /api/payments/webhook
 */
export const handleWebhook = async (req: Request, res: Response) => {
  console.log('Webhook hit');

  try {
    const signature = req.headers['signature'] as string;
    const rawPayload = req.body.toString();

    if (!signature) {
      console.error('Missing webhook signature');
      return errorResponse(res, 'Missing signature', null, 401);
    }

    const result = await paymentService.processWebhook(signature, rawPayload);

    console.log(`Webhook processed successfully for ${result.payment.tx_ref}`);
    return successResponse(res, 'Webhook processed successfully');
  } catch (error: any) {
    console.error('Webhook error:', error.message);

    if (error.message === 'Invalid webhook signature') {
      return errorResponse(res, 'Invalid webhook signature', null, 401);
    }

    if (error.message === 'Payment record not found') {
      return errorResponse(res, 'Payment not found', null, 404);
    }

    if (error.message === 'Amount verification failed') {
      return errorResponse(res, 'Amount verification failed', null, 403);
    }

    return errorResponse(res, 'Webhook processing failed', null, 500);
  }
};

/**
 * Submit payment report (from customer)
 * POST /api/payments/report
 */
export const submitPaymentReport = async (req: Request, res: Response) => {
  try {
    const { tx_ref, email, status, message } = req.body;

    const report = await paymentService.createPaymentReport({
      txRef: tx_ref,
      email,
      status,
      message,
    });

    return successResponse(res, 'Payment report submitted successfully', report, 201);
  } catch (error: any) {
    console.error('Payment report error:', error);

    if (error.message === 'Payment not found') {
      return errorResponse(res, 'Payment not found', null, 404);
    }

    return errorResponse(res, 'Failed to submit payment report', null, 500);
  }
};

/**
 * Get payment by transaction reference
 * GET /api/payments/:txRef
 */
export const getPayment = async (req: Request, res: Response) => {
  try {
    const { txRef } = req.params;

    const payment = await paymentService.getPaymentByTxRef(txRef);

    if (!payment) {
      return errorResponse(res, 'Payment not found', null, 404);
    }

    return successResponse(res, 'Payment retrieved successfully', {
      id: payment.id,
      txRef: payment.tx_ref,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      checkoutUrl: payment.checkout_url,
      customerEmail: payment.customer_email,
      customerFirstName: payment.customer_first_name,
      customerLastName: payment.customer_last_name,
      createdAt: payment.created_at,
      verifiedAt: payment.verified_at,
      expiresAt: payment.expired_at,
      order: payment.orders ? {
        id: payment.orders.id,
        orderNumber: payment.orders.order_number,
        status: payment.orders.status,
      } : null,
    });
  } catch (error: any) {
    console.error('Get payment error:', error);
    return errorResponse(res, 'Failed to retrieve payment', null, 500);
  }
};

/**
 * Get payments for an order
 * GET /api/payments/order/:orderId
 */
export const getOrderPayments = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const payments = await paymentService.getPaymentsByOrderId(orderId);

    return successResponse(res, 'Payments retrieved successfully', {
      orderId,
      payments: payments.map(p => ({
        id: p.id,
        txRef: p.tx_ref,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
        verifiedAt: p.verified_at,
      })),
    });
  } catch (error: any) {
    console.error('Get order payments error:', error);
    return errorResponse(res, 'Failed to retrieve payments', null, 500);
  }
};

/**
 * Get user's payment history (authenticated)
 * GET /api/payments/my-payments
 */
export const getMyPayments = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'Unauthorized', null, 401);
    }

    const payments = await paymentService.getUserPayments(userId);

    return successResponse(res, 'Payments retrieved successfully', {
      payments: payments.map(p => ({
        id: p.id,
        txRef: p.tx_ref,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        customerEmail: p.customer_email,
        createdAt: p.created_at,
        verifiedAt: p.verified_at,
        order: p.orders ? {
          id: p.orders.id,
          orderNumber: p.orders.order_number,
        } : null,
      })),
    });
  } catch (error: any) {
    console.error('Get my payments error:', error);
    return errorResponse(res, 'Failed to retrieve payments', null, 500);
  }
};
