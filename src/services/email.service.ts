/**
 * Email Service (Resend)
 * 
 * Centralized email sending service using Resend.
 * Used for password resets, order notifications, welcome emails, etc.
 */

import { Resend } from 'resend';
import { emailConfig, isEmailConfigured, getFromAddress } from '../config/email.config';
import {
  passwordResetTemplate,
  welcomeTemplate,
  orderConfirmationTemplate,
  notificationTemplate,
} from '../templates/email.templates';

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

/**
 * Send an email via Resend
 */
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

/**
 * Send order confirmation email
 */
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
  const template = orderConfirmationTemplate(data);

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
    orderNumber: string;
    releaseCode: string;
    shopName: string;
  }
): Promise<EmailResult> => {
  return sendNotificationEmail(email, {
    userName: data.userName,
    title: `Your Release Code for Order #${data.orderNumber}`,
    message: `
      Your order from <strong>${data.shopName}</strong> has been confirmed!<br><br>
      Your release code is: <strong style="font-size: 24px; letter-spacing: 2px;">${data.releaseCode}</strong><br><br>
      Share this code with the seller upon delivery to release the payment from escrow.
      <br><br>
      <em>Keep this code safe and only share it when you've received your order.</em>
    `,
    ctaText: 'View Order',
    ctaUrl: `${emailConfig.app.url}/orders`,
    type: 'info',
  });
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

// Export email service object for convenience
export const emailService = {
  send: sendEmail,
  sendPasswordReset: sendPasswordResetEmail,
  sendWelcome: sendWelcomeEmail,
  sendOrderConfirmation: sendOrderConfirmationEmail,
  sendNotification: sendNotificationEmail,
  sendReleaseCode: sendReleaseCodeEmail,
  sendWalletCredited: sendWalletCreditedEmail,
  sendWithdrawalCompleted: sendWithdrawalCompletedEmail,
  isConfigured: isEmailConfigured,
};
