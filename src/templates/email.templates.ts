/**
 * Sankha Email Templates (v4.0 - Sentinel Brand Alignment)
 * Style: Midnight Navy Header + Sankha Teal Actions + Minimalist Card
 */

import { emailConfig } from '../config/email.config';

const COLORS = {
  primary: '#002147',      // Midnight Navy (Brand Authority)
  secondary: '#2EC4B6',    // Fixed: Sankha Teal (Corrected 6-digit hex)
  secondaryDark: '#1B9A57', // Darker Teal for hover-states
  accent: '#FF8C00',       // Blaze Orange (Urgency/Alerts)
  background: '#F8FAFC',   // Milk White (Neutral background)
  cardBg: '#ffffff',
  text: '#0F172A',         // Slate 900 (High contrast text)
  textMuted: '#64748B',    
  border: '#E2E8F0',
};

/**
 * Common Base Template used by all emails
 */
const baseTemplate = (content: string, preheader: string = ''): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: 'Inter', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
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
                    <span style="color: rgba(255,255,255,0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">MALAWI'S TRUSTED MARKETPLACE</span>
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
            <td align="center" style="padding: 35px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="${emailConfig.social.facebook}" target="_blank" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" width="24" height="24" alt="Facebook" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="${emailConfig.social.instagram}" target="_blank" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733558.png" width="24" height="24" alt="Instagram" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="${emailConfig.social.twitter}" target="_blank" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" width="24" height="24" alt="Twitter" style="display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: ${COLORS.textMuted}; font-size: 12px; font-weight: 500;">
                © ${new Date().getFullYear()} Sankha • Lilongwe, Malawi
              </p>
              
              <p style="margin: 10px 0 0; color: ${COLORS.textMuted}; font-size: 12px;">
                Secure. Trusted. Community. <a href="mailto:${emailConfig.app.supportEmail}" style="color: ${COLORS.secondary}; text-decoration: none; font-weight: 700;">Support</a>
              </p>
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
 * Password Reset Template
 */
export const passwordResetTemplate = (data: {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}) => {
  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Reset Your Password</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, we received a request to change your password. 
      Click the button below to secure your account.
    </p>
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 35px 0;">
      <tr>
        <td align="center" bgcolor="${COLORS.secondary}" style="border-radius: 10px;">
          <a href="${data.resetUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%);">Reset Password</a>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6; margin-top: 10px;">
      If the button above is not visible, open this link in your browser:
      <br><a href="${data.resetUrl}" target="_blank" style="color: ${COLORS.secondary};">${data.resetUrl}</a>
    </p>
    
    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6;">
      This link is valid for ${data.expiresInMinutes} minutes.
    </p>
  `;

  return { 
    subject: `[Sankha] Reset your password`, 
    html: baseTemplate(content, `Password reset for ${data.userName}`), 
    text: `Reset your password: ${data.resetUrl}` 
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
      <td style="padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text}; text-align: right;">MK ${item.price.toLocaleString()}</td>
    </tr>
  `).join('');

  const releaseCodeSection = data.releaseCode ? `
    <div style="background-color: ${COLORS.background}; border: 2px solid ${COLORS.secondary}; border-radius: 12px; padding: 24px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 10px; font-size: 11px; font-weight: 800; color: ${COLORS.primary}; text-transform: uppercase; letter-spacing: 2px;">SENTINEL SECURE CODE</p>
      
      <div style="background-color: #ffffff; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; display: inline-block; min-width: 220px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <span style="margin: 0; font-size: 32px; font-weight: 800; color: ${COLORS.text}; letter-spacing: 6px; font-family: 'Courier New', Courier, monospace;">${data.releaseCode}</span>
      </div>
      
      <p style="margin: 15px 0 0; font-size: 13px; color: ${COLORS.accent}; font-weight: 700; line-height: 1.4;">
        ⚠️ IMPORTANT: Only share this code after you've physically received and verified your items.
      </p>
    </div>
  ` : '';

  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Order Confirmed!</h2>
    
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, order <strong>#${data.orderNumber}</strong> has been placed successfully.
    </p>
    
    <div style="background-color: ${COLORS.background}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 20px; margin: 25px 0;">
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
          <td colspan="2" style="padding: 15px 0; text-align: right; font-weight: 700; color: ${COLORS.text};">Total:</td>
          <td style="padding: 15px 0; text-align: right; font-weight: 700; color: ${COLORS.secondary}; font-size: 18px;">MK ${data.total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 35px 0;">
      <tr>
        <td align="center" bgcolor="${COLORS.secondary}" style="border-radius: 10px;">
          <a href="${emailConfig.app.url}/orders/${data.orderNumber}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%);">Track My Order</a>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6; margin-top: 10px;">If the button above is not visible, open this link: <a href="${emailConfig.app.url}/orders/${data.orderNumber}" style="color: ${COLORS.secondary};">${emailConfig.app.url}/orders/${data.orderNumber}</a></p>
  `;

  return { 
    subject: `Order Confirmed #${data.orderNumber}`, 
    html: baseTemplate(content, `Your order #${data.orderNumber} has been confirmed`), 
    text: `Order #${data.orderNumber} confirmed.` 
  };
};

/**
 * Release Code Template (includes transaction table)
 */
export const releaseCodeTemplate = (data: ReleaseCodeData) => {
  const itemRows = data.items.map(item => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text};">${item.name}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid ${COLORS.border}; text-align: center; color: ${COLORS.textMuted};">${item.quantity}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid ${COLORS.border}; text-align: right; color: ${COLORS.text};">MK ${item.price.toLocaleString()}</td>
    </tr>
  `).join('');

  const content = `
    <h2 style="margin: 0 0 10px; font-size: 20px; font-weight: 700; color: ${COLORS.primary};">Delivery Verification Code</h2>
    <p style="margin: 0 0 16px; color: ${COLORS.text};">Hi <strong>${data.userName}</strong>, your order <strong>#${data.orderNumber}</strong> from <strong>${data.shopName}</strong> is confirmed.</p>

    <div style="background-color: ${COLORS.background}; border: 2px solid ${COLORS.secondary}; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
      <div style="background-color: #ffffff; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 18px; display: inline-block; min-width: 260px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: ${COLORS.text}; letter-spacing: 8px;">${data.releaseCode}</span>
      </div>
    </div>

    <p style="color: ${COLORS.accent}; font-weight: 700;">⚠️ Security Notice: Only share this code in person after you have physically inspected the items. Never share this code via chat, phone, or email.</p>

    <h3 style="margin-top: 22px; font-size: 16px; color: ${COLORS.primary};">Order summary</h3>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 12px 0;">
      <thead>
        <tr>
          <th style="text-align:left; color:${COLORS.textMuted}; font-size:12px; padding-bottom:8px;">Item</th>
          <th style="text-align:center; color:${COLORS.textMuted}; font-size:12px; padding-bottom:8px;">Qty</th>
          <th style="text-align:right; color:${COLORS.textMuted}; font-size:12px; padding-bottom:8px;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding-top:12px; text-align:right; font-weight:700; color:${COLORS.text};">Subtotal:</td>
          <td style="padding-top:12px; text-align:right; font-weight:700; color:${COLORS.text};">MK ${data.subtotal.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align:right; color:${COLORS.textMuted};">Delivery:</td>
          <td style="text-align:right; color:${COLORS.textMuted};">MK ${data.deliveryFee.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:10px; text-align:right; font-weight:800; color:${COLORS.secondary};">Total:</td>
          <td style="padding-top:10px; text-align:right; font-weight:800; color:${COLORS.secondary};">MK ${data.total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin: 24px 0; text-align:center;">
      <a href="${emailConfig.app.url}/orders/${data.orderNumber}" style="display:inline-block; padding:12px 26px; color:#ffffff; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); border-radius:10px; font-weight:700; text-decoration:none;">View Order</a>
    </div>
  `;

  return {
    subject: `Release code for order #${data.orderNumber}`,
    html: baseTemplate(content, `Release code for ${data.orderNumber}`),
    text: `Release code for order #${data.orderNumber}: ${data.releaseCode}`,
  };
};

/**
 * Verification Code Template (sign-up / MFA)
 */
export const verificationCodeTemplate = (data: VerificationCodeData) => {
  const content = `
    <h2 style="margin:0 0 12px; font-size:20px; color:${COLORS.primary};">Verification Code</h2>
    <p style="color:${COLORS.text}; margin:0 0 16px;">Hi <strong>${data.userName}</strong>, use the code below to complete verification.</p>

    <div style="background:#ffffff; border:1px solid ${COLORS.border}; padding:18px; display:inline-block; border-radius:10px;">
      <div style="font-family: 'Courier New', Courier, monospace; font-size:36px; font-weight:800; letter-spacing:8px; color:${COLORS.text};">${data.code}</div>
    </div>

    <p style="color:${COLORS.textMuted}; margin-top:14px;">This code is valid for ${data.expiresInMinutes ?? 10} minutes. If you didn't request this, ignore this email or contact support.</p>
  `;

  return {
    subject: `Your verification code`,
    html: baseTemplate(content, `Verification code`),
    text: `Your verification code: ${data.code}`,
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
  ctaText?: string;
  ctaUrl?: string;
}) => {
  let content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Bulk Upload Results</h2>
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, your recent product upload has finished processing.
    </p>
    <div style="background-color: ${COLORS.background}; border-radius: 12px; padding: 20px; margin: 25px 0;">
      ${data.htmlSummary}
    </div>
  `;

  if (data.ctaText && data.ctaUrl) {
    content += `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 35px auto;">
        <tr>
          <td align="center" bgcolor="${COLORS.secondary}" style="border-radius: 12px;">
            <a href="${data.ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); border-radius: 12px;">
              ${data.ctaText}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  return { 
    subject: data.subject, 
    html: baseTemplate(content, data.subject), 
    text: data.textSummary || data.subject 
  };
};

/**
 * Generic notification template
 */
export const notificationTemplate = (data: {
  userName: string;
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}) => {
  const typeColors = {
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  };
  
  const color = typeColors[data.type || 'info'];
  const ctaButton = data.ctaText && data.ctaUrl
    ? `<a href="${data.ctaUrl}" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">${data.ctaText}</a>`
    : '';

  return {
    subject: data.title,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="border-left: 4px solid ${color}; padding-left: 20px;">
          <h2 style="color: ${color}; margin-top: 0;">${data.title}</h2>
          <p>Hi ${data.userName},</p>
          <div style="margin: 20px 0;">${data.message}</div>
          ${ctaButton}
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
      </body>
      </html>
    `,
    text: `${data.title}\n\nHi ${data.userName},\n\n${data.message.replace(/<[^>]*>/g, '')}\n\n${data.ctaUrl ? `${data.ctaText}: ${data.ctaUrl}` : ''}`,
  };
};

/**
 * Welcome Template
 */
export const welcomeTemplate = (data: { userName: string; loginUrl: string }) => {
  const content = `
    <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: ${COLORS.primary};">Welcome to Sankha!</h2>
    <p style="font-size: 16px; color: ${COLORS.text}; line-height: 1.6; margin-bottom: 25px;">
      Hi <strong>${data.userName}</strong>, welcome to Sankha — Malawi's trusted marketplace.
    </p>
    <div style="margin: 35px 0;">
      <a href="${data.loginUrl}" style="background-color: ${COLORS.secondary}; background: linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.secondaryDark} 100%); color: #ffffff; display: inline-block; padding: 18px 40px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; text-align: center;">
        Log In to Your Account
      </a>
    </div>
    <p style="font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.6;">If you did not sign up for this account, please contact support.</p>
  `;

  return {
    subject: `[Sankha] Welcome to Sankha`,
    html: baseTemplate(content, `Welcome ${data.userName}`),
    text: `Welcome ${data.userName} — Log in: ${data.loginUrl}`
  };
};

// releaseCodeTemplate is defined below with detailed transaction data and types

// Re-usable types for templates
export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderConfirmationData {
  userName: string;
  orderNumber: string;
  orderDate: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  releaseCode?: string;
  shopName: string;
  deliveryAddress: string;
}

export interface ReleaseCodeData {
  userName: string;
  orderNumber: string;
  releaseCode: string;
  shopName: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export interface VerificationCodeData {
  userName: string;
  code: string;
  expiresInMinutes?: number;
}