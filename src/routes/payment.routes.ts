import { Router } from 'express';
import express from 'express';
import { protect } from '../middleware/auth.middleware';
import validateResource from '../middleware/validateResource';
import {
  initiatePaymentSchema,
  verifyPaymentSchema,
  paymentReportSchema,
  getPaymentSchema,
  getOrderPaymentsSchema,
  getMyPaymentsSchema,
} from '../schemas/payment.schema';
import {
  initiatePayment,
  verifyPayment,
  handleWebhook,
  submitPaymentReport,
  getPayment,
  getOrderPayments,
  getMyPayments,
} from '../controllers/payment.controller';

const router = Router();

/**
 * @route   POST /api/payments/initiate
 * @desc    Initiate a new payment
 * @access  Public (can be used by guests for checkout)
 * @body    { first_name, last_name, email, phone, amount, currency?, orderId?, metadata? }
 */
router.post('/initiate', express.json(), validateResource(initiatePaymentSchema), initiatePayment);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify payment status
 * @access  Public
 * @body    { tx_ref }
 */
router.post('/verify', express.json(), validateResource(verifyPaymentSchema), verifyPayment);

/**
 * @route   POST /api/payments/webhook
 * @desc    PayChangu webhook endpoint
 * @access  Public (but signature verified)
 * @note    Uses raw body parser for signature validation
 */
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

/**
 * @route   POST /api/payments/report
 * @desc    Submit payment report (from customer)
 * @access  Public
 * @body    { tx_ref, email, status, message }
 */
router.post('/report', express.json(), validateResource(paymentReportSchema), submitPaymentReport);

/**
 * @route   GET /api/payments/my-payments
 * @desc    Get authenticated user's payment history
 * @access  Private
 */
router.get('/my-payments', protect, validateResource(getMyPaymentsSchema), getMyPayments);

/**
 * @route   GET /api/payments/order/:orderId
 * @desc    Get payments for a specific order
 * @access  Private
 */
router.get('/order/:orderId', protect, validateResource(getOrderPaymentsSchema), getOrderPayments);

/**
 * @route   GET /api/payments/:txRef
 * @desc    Get payment by transaction reference
 * @access  Public
 */
router.get('/:txRef', validateResource(getPaymentSchema), getPayment);

export default router;
