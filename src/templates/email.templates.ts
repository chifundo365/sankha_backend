/**
 * Email Templates
 * 
 * Styled HTML templates for transactional emails.
 * All templates use consistent branding and are mobile-responsive.
 */

import { emailConfig } from '../config/email.config';

// Brand colors
const COLORS = {
  primary: '#2563eb',      // Blue
  primaryDark: '#1d4ed8',
  secondary: '#10b981',    // Green
  background: '#f8fafc',
  cardBg: '#ffffff',
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

/**
 * Base email wrapper template
 */
const baseTemplate = (content: string, preheader: string = ''): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${emailConfig.app.name}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset */
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    
    /* Responsive */
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 0 16px !important; }
      .content { padding: 24px 20px !important; }
      .button { width: 100% !important; }
      .header-logo { width: 120px !important; height: auto !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${preheader}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <a href="${emailConfig.app.url}" target="_blank" style="text-decoration: none;">
                <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: ${COLORS.primary};">
                  🛍️ ${emailConfig.app.name}
                </h1>
                <p style="margin: 4px 0 0; font-size: 14px; color: ${COLORS.textMuted};">
                  ${emailConfig.app.tagline}
                </p>
              </a>
            </td>
          </tr>
          
          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${COLORS.cardBg}; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td class="content" style="padding: 40px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <!-- Social Links -->
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <a href="${emailConfig.social.facebook}" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" alt="Facebook" width="24" height="24" />
                    </a>
                    <a href="${emailConfig.social.twitter}" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" alt="Twitter" width="24" height="24" />
                    </a>
                    <a href="${emailConfig.social.instagram}" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733558.png" alt="Instagram" width="24" height="24" />
                    </a>
                  </td>
                </tr>
                
                <!-- Copyright & Links -->
                <tr>
                  <td align="center" style="color: ${COLORS.textMuted}; font-size: 12px; line-height: 1.5;">
                    <p style="margin: 0 0 8px;">
                      Questions? Contact us at 
                      <a href="mailto:${emailConfig.app.supportEmail}" style="color: ${COLORS.primary}; text-decoration: none;">
                        ${emailConfig.app.supportEmail}
                      </a>
                    </p>
                    <p style="margin: 0;">
                      © ${new Date().getFullYear()} ${emailConfig.app.name}. All rights reserved.
                    </p>
                    <p style="margin: 8px 0 0;">
                      <a href="${emailConfig.app.url}/privacy" style="color: ${COLORS.textMuted}; text-decoration: none;">Privacy Policy</a>
                      &nbsp;•&nbsp;
                      <a href="${emailConfig.app.url}/terms" style="color: ${COLORS.textMuted}; text-decoration: none;">Terms of Service</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Password Reset Email Template
 */
export const passwordResetTemplate = (data: {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } => {
  const subject = `Reset your ${emailConfig.app.name} password`;
  const preheader = `Reset your password. This link expires in ${data.expiresInMinutes} minutes.`;
  
  const content = `
    <!-- Icon -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark}); border-radius: 50%; line-height: 64px; text-align: center;">
        <span style="font-size: 28px;">🔐</span>
      </div>
    </div>
    
    <!-- Heading -->
    <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: ${COLORS.text}; text-align: center;">
      Reset Your Password
    </h2>
    
    <!-- Greeting -->
    <p style="margin: 0 0 16px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Hi <strong>${data.userName}</strong>,
    </p>
    
    <!-- Message -->
    <p style="margin: 0 0 24px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      We received a request to reset your password for your ${emailConfig.app.name} account. 
      Click the button below to create a new password.
    </p>
    
    <!-- Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" 
         class="button"
         style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark}); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);">
        Reset Password
      </a>
    </div>
    
    <!-- Expiry Warning -->
    <div style="background-color: #fef3c7; border-left: 4px solid ${COLORS.warning}; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        ⏰ <strong>This link expires in ${data.expiresInMinutes} minutes.</strong><br>
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    
    <!-- Alternative Link -->
    <p style="margin: 24px 0 0; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.6;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin: 8px 0 0; font-size: 12px; color: ${COLORS.primary}; word-break: break-all; background-color: ${COLORS.background}; padding: 12px; border-radius: 6px;">
      ${data.resetUrl}
    </p>
    
    <!-- Security Note -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${COLORS.border};">
      <p style="margin: 0; font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6;">
        🔒 <strong>Security tip:</strong> ${emailConfig.app.name} will never ask for your password via email. 
        If you didn't request this password reset, please ignore this email or contact support if you have concerns.
      </p>
    </div>
  `;
  
  const html = baseTemplate(content, preheader);
  
  // Plain text version
  const text = `
Reset Your Password

Hi ${data.userName},

We received a request to reset your password for your ${emailConfig.app.name} account.

Click the link below to create a new password:
${data.resetUrl}

This link expires in ${data.expiresInMinutes} minutes.

If you didn't request this password reset, you can safely ignore this email.

---
${emailConfig.app.name}
${emailConfig.app.tagline}
  `.trim();
  
  return { subject, html, text };
};

/**
 * Welcome Email Template
 */
export const welcomeTemplate = (data: {
  userName: string;
  loginUrl?: string;
}): { subject: string; html: string; text: string } => {
  const subject = `Welcome to ${emailConfig.app.name}! 🎉`;
  const preheader = `Your account has been created. Start shopping on Malawi's trusted marketplace.`;
  
  const content = `
    <!-- Icon -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 80px; height: 80px; background: linear-gradient(135deg, ${COLORS.secondary}, #059669); border-radius: 50%; line-height: 80px; text-align: center;">
        <span style="font-size: 36px;">🎉</span>
      </div>
    </div>
    
    <!-- Heading -->
    <h2 style="margin: 0 0 16px; font-size: 28px; font-weight: 600; color: ${COLORS.text}; text-align: center;">
      Welcome to ${emailConfig.app.name}!
    </h2>
    
    <!-- Greeting -->
    <p style="margin: 0 0 16px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Hi <strong>${data.userName}</strong>,
    </p>
    
    <!-- Message -->
    <p style="margin: 0 0 24px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Thank you for joining ${emailConfig.app.name}! We're excited to have you as part of Malawi's trusted marketplace.
    </p>
    
    <!-- Features -->
    <div style="background-color: ${COLORS.background}; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${COLORS.text};">
        What you can do:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: ${COLORS.text}; font-size: 14px; line-height: 1.8;">
        <li>🛍️ Browse products from verified sellers</li>
        <li>💰 Compare prices across multiple shops</li>
        <li>🔒 Shop securely with escrow protection</li>
        <li>📦 Track your orders in real-time</li>
      </ul>
    </div>
    
    <!-- Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.loginUrl || emailConfig.app.url}" 
         class="button"
         style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, ${COLORS.secondary}, #059669); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.4);">
        Start Shopping
      </a>
    </div>
  `;
  
  const html = baseTemplate(content, preheader);
  
  const text = `
Welcome to ${emailConfig.app.name}!

Hi ${data.userName},

Thank you for joining ${emailConfig.app.name}! We're excited to have you as part of Malawi's trusted marketplace.

What you can do:
- Browse products from verified sellers
- Compare prices across multiple shops
- Shop securely with escrow protection
- Track your orders in real-time

Start shopping: ${data.loginUrl || emailConfig.app.url}

---
${emailConfig.app.name}
${emailConfig.app.tagline}
  `.trim();
  
  return { subject, html, text };
};

/**
 * Order Confirmation Email Template
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
}): { subject: string; html: string; text: string } => {
  const subject = `Order Confirmed: ${data.orderNumber} 🛍️`;
  const preheader = `Your order #${data.orderNumber} has been confirmed. ${data.releaseCode ? `Your release code: ${data.releaseCode}` : ''}`;
  
  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border};">
        <p style="margin: 0; font-size: 14px; color: ${COLORS.text};">${item.name}</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: ${COLORS.textMuted};">Qty: ${item.quantity}</p>
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${COLORS.text};">MWK ${item.price.toLocaleString()}</p>
      </td>
    </tr>
  `).join('');
  
  const releaseCodeSection = data.releaseCode ? `
    <div style="background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark}); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,0.8);">
        Your Release Code
      </p>
      <p style="margin: 0; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: 4px;">
        ${data.releaseCode}
      </p>
      <p style="margin: 12px 0 0; font-size: 12px; color: rgba(255,255,255,0.8);">
        Share this code with the seller upon delivery to release payment
      </p>
    </div>
  ` : '';
  
  const content = `
    <!-- Order Confirmed Badge -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, ${COLORS.success}, #16a34a); border-radius: 50%; line-height: 64px; text-align: center;">
        <span style="font-size: 28px;">✓</span>
      </div>
    </div>
    
    <h2 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${COLORS.text}; text-align: center;">
      Order Confirmed!
    </h2>
    <p style="margin: 0 0 24px; font-size: 14px; color: ${COLORS.textMuted}; text-align: center;">
      Order #${data.orderNumber} • ${data.orderDate}
    </p>
    
    <p style="margin: 0 0 16px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Hi <strong>${data.userName}</strong>,
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Thank you for your order from <strong>${data.shopName}</strong>! Your payment has been received and your order is being prepared.
    </p>
    
    ${releaseCodeSection}
    
    <!-- Order Items -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td colspan="2" style="padding-bottom: 12px;">
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Order Summary</p>
        </td>
      </tr>
      ${itemsHtml}
      <tr>
        <td style="padding: 12px 0;"><p style="margin: 0; font-size: 14px; color: ${COLORS.textMuted};">Subtotal</p></td>
        <td style="padding: 12px 0; text-align: right;"><p style="margin: 0; font-size: 14px; color: ${COLORS.text};">MWK ${data.subtotal.toLocaleString()}</p></td>
      </tr>
      <tr>
        <td style="padding: 0 0 12px;"><p style="margin: 0; font-size: 14px; color: ${COLORS.textMuted};">Delivery Fee</p></td>
        <td style="padding: 0 0 12px; text-align: right;"><p style="margin: 0; font-size: 14px; color: ${COLORS.text};">MWK ${data.deliveryFee.toLocaleString()}</p></td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-top: 2px solid ${COLORS.border};"><p style="margin: 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Total</p></td>
        <td style="padding: 12px 0; border-top: 2px solid ${COLORS.border}; text-align: right;"><p style="margin: 0; font-size: 18px; font-weight: 700; color: ${COLORS.primary};">MWK ${data.total.toLocaleString()}</p></td>
      </tr>
    </table>
    
    <!-- Delivery Address -->
    <div style="background-color: ${COLORS.background}; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: ${COLORS.text};">📍 Delivery Address</p>
      <p style="margin: 0; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.6;">${data.deliveryAddress}</p>
    </div>
    
    <!-- CTA -->
    <div style="text-align: center; margin: 32px 0 0;">
      <a href="${emailConfig.app.url}/orders" 
         style="display: inline-block; padding: 14px 32px; background-color: ${COLORS.background}; color: ${COLORS.primary}; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; border: 2px solid ${COLORS.primary};">
        Track Order
      </a>
    </div>
  `;
  
  const html = baseTemplate(content, preheader);
  
  const text = `
Order Confirmed! #${data.orderNumber}

Hi ${data.userName},

Thank you for your order from ${data.shopName}!

${data.releaseCode ? `Your Release Code: ${data.releaseCode}\nShare this code with the seller upon delivery to release payment.\n` : ''}

Order Summary:
${data.items.map(item => `- ${item.name} (x${item.quantity}): MWK ${item.price.toLocaleString()}`).join('\n')}

Subtotal: MWK ${data.subtotal.toLocaleString()}
Delivery: MWK ${data.deliveryFee.toLocaleString()}
Total: MWK ${data.total.toLocaleString()}

Delivery Address:
${data.deliveryAddress}

Track your order: ${emailConfig.app.url}/orders

---
${emailConfig.app.name}
  `.trim();
  
  return { subject, html, text };
};

/**
 * Generic notification email template
 */
export const notificationTemplate = (data: {
  userName: string;
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}): { subject: string; html: string; text: string } => {
  const typeConfig = {
    info: { color: COLORS.primary, icon: 'ℹ️' },
    success: { color: COLORS.success, icon: '✅' },
    warning: { color: COLORS.warning, icon: '⚠️' },
    error: { color: COLORS.error, icon: '❌' },
  };
  
  const config = typeConfig[data.type || 'info'];
  
  const subject = data.title;
  const preheader = data.message.substring(0, 100);
  
  const ctaSection = data.ctaText && data.ctaUrl ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.ctaUrl}" 
         style="display: inline-block; padding: 14px 32px; background-color: ${config.color}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
        ${data.ctaText}
      </a>
    </div>
  ` : '';
  
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 48px;">${config.icon}</span>
    </div>
    
    <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: ${COLORS.text}; text-align: center;">
      ${data.title}
    </h2>
    
    <p style="margin: 0 0 16px; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      Hi <strong>${data.userName}</strong>,
    </p>
    
    <p style="margin: 0; font-size: 16px; color: ${COLORS.text}; line-height: 1.6;">
      ${data.message}
    </p>
    
    ${ctaSection}
  `;
  
  const html = baseTemplate(content, preheader);
  
  const text = `
${data.title}

Hi ${data.userName},

${data.message}

${data.ctaUrl ? `${data.ctaText}: ${data.ctaUrl}` : ''}

---
${emailConfig.app.name}
  `.trim();
  
  return { subject, html, text };
};

/**
 * Bulk upload summary email template
 */
export const bulkUploadSummaryTemplate = (data: {
  userName: string;
  subject: string;
  htmlSummary: string;
  textSummary?: string;
  ctaText?: string;
  ctaUrl?: string;
}): { subject: string; html: string; text: string } => {
  const subject = data.subject;
  const preheader = 'Bulk upload summary for your shop.';
  const ctaSection = data.ctaText && data.ctaUrl ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.ctaUrl}" 
         style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
        ${data.ctaText}
      </a>
    </div>
  ` : '';
  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 48px;">📦</span>
    </div>
    <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1a237e; text-align: center;">
      ${subject}
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; color: #1e293b; line-height: 1.6;">
      Hi <strong>${data.userName}</strong>,
    </p>
    <div>${data.htmlSummary}</div>
    ${ctaSection}
  `;
  const html = baseTemplate(content, preheader);
  const text = data.textSummary || `${subject}\n\nSee your shop dashboard for details.`;
  return { subject, html, text };
};
