/**
 * Email Service (Resend)
 * 
 * Centralized email sending service using Resend.
 * Used for password resets, order notifications, welcome emails, etc.
 */

import { Resend } from 'resend';
import { emailConfig, isEmailConfigured, getFromAddress } from '../config/email.config';
import prismaClient from '../prismaClient';
import {
  orderConfirmationTemplate,
  notificationTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  verificationCodeTemplate,
  sellerPayoutTemplate,
  ReleaseCodeData,
  OrderItem,
  SellerInfo,
  VerificationCodeData,
} from '../templates/email.templates';
import smsService from './sms.service';

// Initialize Resend client
let resend: Resend | null = null;

import fs from 'fs';
import path from 'path';

const getResendClient = (): Resend | null => {
  if (!isEmailConfigured()) {
    console.warn('Email service not configured: RESEND_API_KEY is missing');
    return null;
  }
  
  if (!resend) {
    resend = new Resend(emailConfig.apiKey);
  }
  
  return resend;
};

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<EmailResult> => {
  const client = getResendClient();

  if (!client) {
    // In development, log instead of failing
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 [DEV] Email would be sent:');
      console.log(`   To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
      console.log(`   Subject: ${options.subject}`);
      return { success: true, messageId: 'dev-mode-skipped' };
    }
    return { success: false, error: 'Email service not configured' };
  }

  try {
    // Debug: log whether HTML contains known CTA markers to help diagnose missing button issues
    try {
      const hasViewProducts = options.html && options.html.includes('View Your Products');
      const hasReviewUpload = options.html && options.html.includes('Review Upload');
      console.log(`📧 [Email Debug] to=${Array.isArray(options.to) ? options.to.join(',') : options.to} subject=${options.subject} hasViewProducts=${hasViewProducts} hasReviewUpload=${hasReviewUpload}`);
      // Save full HTML to generated/email-debug for inspection (development only)
      try {
        if (process.env.NODE_ENV !== 'production') {
          const debugDir = path.join(process.cwd(), 'generated', 'email-debug');
          fs.mkdirSync(debugDir, { recursive: true });
          const safeSubject = (options.subject || 'email').replace(/[^a-z0-9-_]/gi, '_').slice(0, 50);
          const filePath = path.join(debugDir, `${Date.now()}-${safeSubject}.html`);
          try {
            fs.writeFileSync(filePath, options.html || '', 'utf8');
            console.log(`📧 [Email Debug] HTML written to ${filePath}`);
          } catch (writeErr) {
            console.error('📧 [Email Debug] failed to write HTML file', writeErr);
          }
        }
      } catch (err) {
        // ignore file write errors
      }
    } catch (err) {
      // ignore debug logging errors
    }

    // Log the effective From address to help diagnose Resend validation errors
    try {
      console.log(`📧 [Email Debug] from=${getFromAddress()}`);
    } catch (err) {
      // ignore logging errors
    }

    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || emailConfig.app.supportEmail,
      tags: options.tags,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log(`📧 Email sent successfully: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (error: any) {
    console.error('Email send error:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
};

// ==================== SPECIFIC EMAIL METHODS ====================

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (
  email: string,
  userName: string,
  resetToken: string
): Promise<EmailResult> => {
  const resetUrl = `${emailConfig.app.url}/reset-password?token=${resetToken}`;
  
  const template = passwordResetTemplate({
    userName,
    resetUrl,
    expiresInMinutes: 60, // 1 hour
  });

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: 'category', value: 'password-reset' }],
  });
};

/**
 * Send welcome email to new users
 */
export const sendWelcomeEmail = async (
  email: string,
  userName: string
): Promise<EmailResult> => {
  const template = welcomeTemplate({
    userName,
    loginUrl: `${emailConfig.app.url}/login`,
  });

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: 'category', value: 'welcome' }],
  });
};
export const sendOrderConfirmationEmail = async (
  email: string,
  data: {
    userName: string;
    orderNumber: string;
    orderDate: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    subtotal: number;
    deliveryFee: number;
    total: number;
    releaseCode?: string;
    shopName: string;
    deliveryAddress: string;
  }
): Promise<EmailResult> => {
  const payload: ReleaseCodeData = {
    userName: data.userName,
    orderId: data.orderNumber,
    orderNumber: data.orderNumber,
    frontendUrl: emailConfig.app.url,
    releaseCode: data.releaseCode || '',
    items: data.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
    subtotal: data.subtotal,
    deliveryFee: data.deliveryFee,
    total: data.total,
    seller: { shopName: data.shopName },
  };

  const template = orderConfirmationTemplate(payload);

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [
      { name: 'category', value: 'order-confirmation' },
      { name: 'order_number', value: data.orderNumber },
    ],
  });
};

/**
 * Send generic notification email
 */
export const sendNotificationEmail = async (
  email: string,
  data: {
    userName: string;
    title: string;
    message: string;
    ctaText?: string;
    ctaUrl?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
  }
): Promise<EmailResult> => {
  const template = notificationTemplate(data);

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: 'category', value: 'notification' }],
  });
};

/**
 * Send release code to buyer
 */
export const sendReleaseCodeEmail = async (
  email: string,
  data: {
    userName: string;
    orderId: string;
    orderNumber: string;
    releaseCode: string;
    frontendUrl?: string;
    shopName: string;
    sellerPhone?: string;
    buyerPhone?: string;
    sellerLocation?: string;
    items?: OrderItem[];
    subtotal?: number;
    deliveryFee?: number;
    total?: number;
  }
): Promise<EmailResult> => {
  // Compose data for the unified order confirmation/release template
  const frontend = data.frontendUrl || emailConfig.app.url;
  const seller: SellerInfo = { shopName: data.shopName, phoneNumber: data.sellerPhone, location: data.sellerLocation };
  const orderIdValue = data.orderId || data.orderNumber || '';

  const payload: ReleaseCodeData = {
    userName: data.userName,
    orderId: orderIdValue,
    orderNumber: data.orderNumber,
    frontendUrl: frontend,
    releaseCode: data.releaseCode,
    items: data.items || [],
    subtotal: data.subtotal || 0,
    deliveryFee: data.deliveryFee || 0,
    total: data.total || 0,
    seller,
  };

  const template = orderConfirmationTemplate(payload);


  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [
      { name: 'category', value: 'release-code' },
      { name: 'order_number', value: data.orderNumber },
    ],
  });
};

/**
 * Convenience: fetch order + seller details from DB and send release-code email
 * Exports a function that callers can use by orderId.
 */
export const sendReleaseCodeForOrder = async (orderId: string): Promise<EmailResult> => {
  try {
    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        users: true,
        shops: true,
        order_items: true,
      },
    });

    if (!order) return { success: false, error: 'Order not found' };

    const buyerEmail = order.users?.email;
    if (!buyerEmail) return { success: false, error: 'Buyer email not available' };

    const items: OrderItem[] = (order.order_items || []).map((it: any) => ({ name: it.product_name, quantity: it.quantity, price: Number(it.base_price ?? it.unit_price ?? 0) }));

    const releaseCode = order.release_code || '';

    const buyerPhone = (order.users as any)?.phone_number || '';

    const data = {
      userName: `${order.users?.first_name || ''} ${order.users?.last_name || ''}`.trim() || 'Customer',
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      releaseCode,
      frontendUrl: emailConfig.app.url,
      shopName: order.shops?.name || 'Seller',
      sellerPhone: (order.shops as any)?.phone_number || '',
      sellerLocation: (order.shops as any)?.city || '',
      buyerPhone,
      items,
      subtotal: Number(order.total_amount ?? items.reduce((s,i)=>s + i.price*i.quantity,0)),
      deliveryFee: Number((order as any).delivery_fee ?? (order as any).deliveryFee ?? 0),
      total: Number(order.total_amount ?? 0),
    };

    // Extract lat/lng if present on shop or order (tolerant to field names)
    const shopLat = (order.shops as any)?.lat ?? (order.shops as any)?.latitude ?? null;
    const shopLng = (order.shops as any)?.lng ?? (order.shops as any)?.longitude ?? null;
    const buyerLat = (order as any)?.delivery_lat ?? (order as any)?.buyer_lat ?? null;
    const buyerLng = (order as any)?.delivery_lng ?? (order as any)?.buyer_lng ?? null;

    // Build buyer payload and send buyer email
    const buyerPayload: ReleaseCodeData = {
      userName: data.userName,
      orderId: String(data.orderId),
      orderNumber: data.orderNumber,
      frontendUrl: data.frontendUrl,
      releaseCode: data.releaseCode,
      items: data.items,
      subtotal: data.subtotal,
      deliveryFee: data.deliveryFee,
      total: data.total,
      seller: { shopName: data.shopName, phoneNumber: data.sellerPhone, location: data.sellerLocation, lat: shopLat, lng: shopLng },
      buyerLocation: { lat: buyerLat, lng: buyerLng },
    };

    const buyerEmailResult = await sendReleaseCodeEmail(buyerEmail, buyerPayload as any);

    // Send buyer SMS (if phone exists)
    try {
      if (data.buyerPhone) {
        const smsBuyer = await smsService.sendBuyerSms(
          data.buyerPhone,
          data.total || 0,
          data.shopName,
          data.releaseCode,
          data.sellerPhone || '',
          data.orderId
        );
        console.log('sendReleaseCodeForOrder buyer SMS:', smsBuyer);
      }
    } catch (smsErr) {
      console.error('sendReleaseCodeForOrder buyer SMS error:', smsErr);
    }

    // Send seller email & SMS (if seller contact exists)
    try {
      const sellerEmail = (order.shops as any)?.email || (order as any)?.seller_email || '';
      if (sellerEmail) {
        const sellerTemplate = sellerPayoutTemplate({
          sellerName: (order.shops as any)?.name || '',
          amount: Number(data.total || 0),
          orderNumber: data.orderNumber,
          buyerName: data.userName,
          buyerPhone: data.buyerPhone,
          buyerAddress: (order as any)?.delivery_address || (order as any)?.deliveryAddress || '',
          buyerLat,
          buyerLng,
          dashboardUrl: `${emailConfig.app.url}/seller/orders/${data.orderId}`,
        });

        const sellerEmailRes = await sendEmail({
          to: sellerEmail,
          subject: sellerTemplate.subject,
          html: sellerTemplate.html,
          text: sellerTemplate.text,
          tags: [{ name: 'category', value: 'seller-payout' }, { name: 'order_number', value: data.orderNumber }],
        });

        console.log('sendReleaseCodeForOrder seller email:', sellerEmailRes);
      }

      const sellerPhone = data.sellerPhone || (order.shops as any)?.phone_number || '';
      if (sellerPhone) {
        const smsSeller = await smsService.sendSellerSms(sellerPhone, data.orderNumber, data.userName, data.total || 0);
        console.log('sendReleaseCodeForOrder seller SMS:', smsSeller);
      }
    } catch (errSms) {
      console.error('sendReleaseCodeForOrder seller notification error:', errSms);
    }

    return buyerEmailResult;
  } catch (err: any) {
    console.error('sendReleaseCodeForOrder error:', err);
    return { success: false, error: err?.message || 'Failed to send release code email' };
  }
};

/**
 * Send wallet credited notification to seller
 */
export const sendWalletCreditedEmail = async (
  email: string,
  data: {
    userName: string;
    orderNumber: string;
    amount: number;
    newBalance: number;
  }
): Promise<EmailResult> => {
  return sendNotificationEmail(email, {
    userName: data.userName,
    title: `Payment Received: MWK ${data.amount.toLocaleString()}`,
    message: `
      Great news! The payment for order <strong>#${data.orderNumber}</strong> has been released to your wallet.<br><br>
      <strong>Amount credited:</strong> MWK ${data.amount.toLocaleString()}<br>
      <strong>New wallet balance:</strong> MWK ${data.newBalance.toLocaleString()}
    `,
    ctaText: 'View Wallet',
    ctaUrl: `${emailConfig.app.url}/seller/wallet`,
    type: 'success',
  });
};

/**
 * Send withdrawal completed notification
 */
export const sendWithdrawalCompletedEmail = async (
  email: string,
  data: {
    userName: string;
    amount: number;
    fee: number;
    netAmount: number;
    recipientPhone: string;
    reference: string;
  }
): Promise<EmailResult> => {
  return sendNotificationEmail(email, {
    userName: data.userName,
    title: `Withdrawal Completed: MWK ${data.netAmount.toLocaleString()}`,
    message: `
      Your withdrawal has been processed successfully!<br><br>
      <strong>Amount requested:</strong> MWK ${data.amount.toLocaleString()}<br>
      <strong>Fee:</strong> MWK ${data.fee.toLocaleString()}<br>
      <strong>Amount sent:</strong> MWK ${data.netAmount.toLocaleString()}<br>
      <strong>Sent to:</strong> ${data.recipientPhone}<br>
      <strong>Reference:</strong> ${data.reference}
    `,
    ctaText: 'View Transactions',
    ctaUrl: `${emailConfig.app.url}/seller/wallet`,
    type: 'success',
  });
};

/**
 * Send verification code (signup / MFA)
 */
export const sendVerificationCodeEmail = async (
  email: string,
  data: VerificationCodeData
): Promise<EmailResult> => {
  const template = verificationCodeTemplate(data);

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: 'category', value: 'verification-code' }],
  });
};

// Export email service object for convenience
export const emailService = {
  send: sendEmail,
  sendPasswordReset: sendPasswordResetEmail,
  sendWelcome: sendWelcomeEmail,
  sendOrderConfirmation: sendOrderConfirmationEmail,
  sendNotification: sendNotificationEmail,
  sendReleaseCode: sendReleaseCodeEmail,
  sendReleaseCodeForOrder,
  sendWalletCredited: sendWalletCreditedEmail,
  sendWithdrawalCompleted: sendWithdrawalCompletedEmail,
  sendVerificationCode: sendVerificationCodeEmail,
  isConfigured: isEmailConfigured,
};
