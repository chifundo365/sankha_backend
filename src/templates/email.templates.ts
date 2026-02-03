/**
 * Sankha Email Templates (v4.1 - Visual Alignment)
 * Fixed to match the "Second Image" style: Dark Header + Minimalist Card
 */

import { emailConfig } from '../config/email.config';

const COLORS = {
  primary: '#1E3A8A',      // Cosmic Blue (Header Background)
  secondary: '#0D9488',    // Electric Teal (Buttons/Accents)
  secondaryDark: '#0F766E',
  background: '#F8FAFC',   // Very light gray/blue background
  cardBg: '#ffffff',
  text: '#1E293B',         // Slate 800
  textMuted: '#64748B',    
  border: '#E2E8F0',
};

const baseTemplate = (content: string, preheader: string = ''): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: 'Inter', Helvetica, Arial, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${COLORS.background};">
    <tr>
      <td align="center" style="padding: 20px 0 40px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
          
          <tr>
            <td align="center" style="background-color: ${COLORS.primary}; padding: 30px 40px; border-radius: 16px 16px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Sankha</h1>
                  </td>
                  <td align="right">
                    <span style="color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">${emailConfig.app.tagline}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: ${COLORS.cardBg}; padding: 45px 40px; border-radius: 0 0 16px 16px;">
              ${content}
            </td>
          </tr>
          
          <tr>
            <td align="center" style="padding: 30px 0; color: ${COLORS.textMuted}; font-size: 12px;">
              <p style="margin: 0; opacity: 0.8;">© ${new Date().getFullYear()} Sankha Marketplace • Lilongwe, Malawi</p>
              <p style="margin: 8px 0 0;"><a href="${emailConfig.app.url}" style="color: ${COLORS.primary}; text-decoration: none;">Visit Shop</a> | <a href="mailto:${emailConfig.app.supportEmail}" style="color: ${COLORS.primary}; text-decoration: none;">Support</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const passwordResetTemplate = (data: {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}) => {
  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Password Reset</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, we received a request to change your password. 
      Click the button below to secure your account.
    </p>
    
    <div style="margin: 35px 0;">
      <a href="${data.resetUrl}" 
         style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        Secure My Account
      </a>
    </div>
    
    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6;">
      This link is only valid for ${data.expiresInMinutes} minutes. If you didn't request this, 
      please ignore this email or contact our security team.
    </p>
    
    <hr style="border: 0; border-top: 1px solid ${COLORS.border}; margin: 30px 0;">
    
    <p style="font-size: 12px; color: ${COLORS.textMuted};">
      If the button above doesn't work, copy this link: <br>
      <span style="color: ${COLORS.secondary}; word-break: break-all;">${data.resetUrl}</span>
    </p>
  `;

  return { 
    subject: `[Action Required] Reset your Sankha password`, 
    html: baseTemplate(content, `Password reset for ${data.userName}`), 
    text: `Reset your password: ${data.resetUrl}` 
  };
};

/**
 * Welcome Email Template
 */
export const welcomeTemplate = (data: {
  userName: string;
  loginUrl: string;
}) => {
  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Welcome to Sankha!</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, thank you for joining Malawi's premier price comparison marketplace!
    </p>
    
    <p style="font-size: 15px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      You can now compare prices across multiple shops and find the best deals on electronics, 
      gadgets, and more.
    </p>
    
    <div style="margin: 35px 0;">
      <a href="${data.loginUrl}" 
         style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        Start Shopping
      </a>
    </div>
    
    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Need help? Contact us at <a href="mailto:${emailConfig.app.supportEmail}" style="color: ${COLORS.secondary};">${emailConfig.app.supportEmail}</a>
    </p>
  `;

  return { 
    subject: `Welcome to Sankha, ${data.userName}!`, 
    html: baseTemplate(content, `Welcome to Sankha marketplace`), 
    text: `Welcome to Sankha, ${data.userName}! Start shopping at ${emailConfig.app.url}` 
  };
};

/**
 * Order Confirmation Template
 */
export const orderConfirmationTemplate = (data: {
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
}) => {
  const itemRows = data.items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text};">${item.name}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.textMuted}; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text}; text-align: right;">MWK ${item.price.toLocaleString()}</td>
    </tr>
  `).join('');

  const releaseCodeSection = data.releaseCode ? `
    <div style="background: linear-gradient(135deg, ${COLORS.primary}15 0%, ${COLORS.secondary}15 100%); border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 13px; color: ${COLORS.textMuted}; text-transform: uppercase;">Release Code</p>
      <p style="margin: 0; font-size: 28px; font-weight: 700; color: ${COLORS.primary}; letter-spacing: 4px;">${data.releaseCode}</p>
      <p style="margin: 10px 0 0; font-size: 12px; color: ${COLORS.textMuted};">Give this code to the seller only after receiving your order</p>
    </div>
  ` : '';

  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Order Confirmed!</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, your order <strong>#${data.orderNumber}</strong> has been confirmed.
    </p>
    
    <div style="background-color: ${COLORS.background}; border-radius: 12px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0 0 8px; font-size: 13px; color: ${COLORS.textMuted};">Order Date: <strong style="color: ${COLORS.text};">${data.orderDate}</strong></p>
      <p style="margin: 0 0 8px; font-size: 13px; color: ${COLORS.textMuted};">Shop: <strong style="color: ${COLORS.text};">${data.shopName}</strong></p>
      <p style="margin: 0; font-size: 13px; color: ${COLORS.textMuted};">Delivery: <strong style="color: ${COLORS.text};">${data.deliveryAddress}</strong></p>
    </div>
    
    ${releaseCodeSection}
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 25px 0;">
      <thead>
        <tr>
          <th style="padding: 12px 0; border-bottom: 2px solid ${COLORS.border}; text-align: left; color: ${COLORS.textMuted}; font-size: 12px; text-transform: uppercase;">Item</th>
          <th style="padding: 12px 0; border-bottom: 2px solid ${COLORS.border}; text-align: center; color: ${COLORS.textMuted}; font-size: 12px; text-transform: uppercase;">Qty</th>
          <th style="padding: 12px 0; border-bottom: 2px solid ${COLORS.border}; text-align: right; color: ${COLORS.textMuted}; font-size: 12px; text-transform: uppercase;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding: 8px 0; text-align: right; color: ${COLORS.textMuted};">Subtotal:</td>
          <td style="padding: 8px 0; text-align: right; color: ${COLORS.text};">MWK ${data.subtotal.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 8px 0; text-align: right; color: ${COLORS.textMuted};">Delivery:</td>
          <td style="padding: 8px 0; text-align: right; color: ${COLORS.text};">MWK ${data.deliveryFee.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 15px 0; text-align: right; font-weight: 700; color: ${COLORS.text};">Total:</td>
          <td style="padding: 15px 0; text-align: right; font-weight: 700; color: ${COLORS.primary}; font-size: 18px;">MWK ${data.total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
    
    <div style="margin: 35px 0;">
      <a href="${emailConfig.app.url}/orders/${data.orderNumber}" 
         style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        View Order
      </a>
    </div>
  `;

  return { 
    subject: `Order Confirmed #${data.orderNumber}`, 
    html: baseTemplate(content, `Your order #${data.orderNumber} has been confirmed`), 
    text: `Order #${data.orderNumber} confirmed. Total: MWK ${data.total.toLocaleString()}` 
  };
};

/**
 * Generic Notification Template
 */
export const notificationTemplate = (data: {
  userName: string;
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
}) => {
  const ctaButton = data.ctaText && data.ctaUrl ? `
    <div style="margin: 35px 0;">
      <a href="${data.ctaUrl}" 
         style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        ${data.ctaText}
      </a>
    </div>
  ` : '';

  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">${data.title}</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>,
    </p>
    
    <p style="font-size: 15px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      ${data.message}
    </p>
    
    ${ctaButton}
  `;

  return { 
    subject: data.title, 
    html: baseTemplate(content, data.message.substring(0, 100)), 
    text: `${data.title}\n\n${data.message}` 
  };
};

/**
 * Bulk Upload Summary Template
 */
export const bulkUploadSummaryTemplate = (data: {
  userName: string;
  subject: string;
  htmlSummary: string;
  textSummary?: string;
  ctaText: string;
  ctaUrl: string;
}) => {
  const plainText = data.textSummary || data.subject;
  
  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Bulk Upload Complete</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, your bulk upload has been processed.
    </p>
    
    <div style="background-color: ${COLORS.background}; border-radius: 12px; padding: 20px; margin: 25px 0;">
      ${data.htmlSummary}
    </div>
    
    <div style="margin: 35px 0;">
      <a href="${data.ctaUrl}" 
         style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        ${data.ctaText}
      </a>
    </div>
  `;

  return { 
    subject: data.subject, 
    html: baseTemplate(content, plainText.substring(0, 100)), 
    text: plainText 
  };
};