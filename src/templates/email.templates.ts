/**
 * Sankha Email Templates - Sentinel 4.0
 * Unified premium layout for transactional emails and release-code flow
 * Brand: Midnight Navy (#002147) and Sankha Teal (#2EC4B6)
 */

// Exported brand constants
export const BRAND = {
  midnightNavy: '#002147',
  sankhaTeal: '#2EC4B6',
  goldBg: '#FEFCE8',
  white: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E6EDF2',
};

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface SellerInfo {
  shopName: string;
  phoneNumber?: string;
  location?: string;
}

export interface ReleaseCodeData {
  userName: string;
  orderId: string;
  orderNumber: string;
  frontendUrl: string; // used to build confirm link
  releaseCode: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  seller: SellerInfo & { lat?: number | null; lng?: number | null };
  // optional buyer delivery coordinates when available
  buyerLocation?: { lat?: number | null; lng?: number | null } | null;
}

const baseTemplate = (title: string, preheader: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#f5f7fa; font-family: Inter, Helvetica, Arial, sans-serif; }
    a { color: ${BRAND.sankhaTeal}; }
  </style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fa; padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.white}; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background:${BRAND.midnightNavy}; padding:22px 28px; color:#fff;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:800; font-size:20px;">Sankha</div>
                <div style="font-size:11px; opacity:0.9; text-transform:uppercase;">Malawi's Trusted Marketplace</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px; color:${BRAND.text};">
              <h2 style="margin:0 0 8px; font-size:20px; color:${BRAND.midnightNavy};">${title}</h2>
              ${content}
            </td>
          </tr>
              <tr>
                <td style="padding:18px 28px; text-align:center; color:${BRAND.muted}; font-size:12px;">
                  <div style="margin-bottom:8px;">
                    <a href="https://facebook.com/sankha" style="margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" width="20" height="20" alt="Facebook" style="border:0; vertical-align:middle;"/></a>
                    <a href="https://instagram.com/sankha" style="margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733558.png" width="20" height="20" alt="Instagram" style="border:0; vertical-align:middle;"/></a>
                    <a href="https://x.com/sankha" style="margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" width="20" height="20" alt="X" style="border:0; vertical-align:middle;"/></a>
                  </div>
                  © ${new Date().getFullYear()} Sankha • Lilongwe, Malawi &nbsp;•&nbsp; <a href="mailto:support@sankha.example">Support</a>
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
 * Order Confirmation / Release Template
 * Title: Action Required: Your Order is Arriving.
 */
export const orderConfirmationTemplate = (data: ReleaseCodeData) => {
  const itemsHtml = data.items.map(i => `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid ${BRAND.border};">${i.name}</td>
      <td style="padding:10px 0; border-bottom:1px solid ${BRAND.border}; text-align:center;">${i.quantity}</td>
      <td style="padding:10px 0; border-bottom:1px solid ${BRAND.border}; text-align:right;">MK ${i.price.toLocaleString()}</td>
    </tr>
  `).join('');

  // Monospaced secure code box
  const codeBox = data.releaseCode ? `
    <div style="margin:18px 0; text-align:center;">
      <div style="display:inline-block; padding:18px 26px; background:${BRAND.white}; border:1px solid ${BRAND.border}; border-radius:8px; font-family: 'Courier New', monospace; font-weight:800; font-size:28px; letter-spacing:6px; color:${BRAND.text};">${data.releaseCode}</div>
    </div>
  ` : '';

  // Action card (gold background)
  const actionCard = `
    <div style="background:${BRAND.goldBg}; border:1px solid ${BRAND.border}; border-radius:10px; padding:16px; margin:18px 0;">
      <p style="margin:0 0 8px; font-weight:700; color:${BRAND.midnightNavy};">Verification</p>
      <p style="margin:0 0 12px; color:${BRAND.text};">You are paying <strong>${escapeHtml(data.seller.shopName)}</strong> - <strong>MK ${data.total.toLocaleString()}</strong></p>

      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:8px;">
        <a href="tel:${data.seller.phoneNumber || ''}" style="background:${BRAND.white}; padding:10px 14px; border-radius:8px; text-decoration:none; color:${BRAND.midnightNavy}; font-weight:700; border:1px solid ${BRAND.border};">📞 Call Seller</a>

        <a href="${data.frontendUrl.replace(/\/$/, '')}/confirm/${encodeURIComponent(data.orderId)}?code=${encodeURIComponent(data.releaseCode)}" style="background:${BRAND.sankhaTeal}; color:#fff; padding:12px 18px; border-radius:8px; text-decoration:none; font-weight:800;">I Have the Items &amp; I'm Satisfied</a>
      </div>

      <p style="margin:12px 0 0; color:#8b1f1f; font-weight:700;">⚠️ Only click this after physical inspection. This releases funds from escrow and cannot be undone.</p>
    </div>
  `;

  const remoteTip = `<p style="color:${BRAND.muted}; font-size:13px;">If arriving via bus or courier, inspect items at the depot first, then call the seller with your code before releasing payment.</p>`;

  const content = `
    <p style="margin:0 0 12px; color:${BRAND.text};">Hi <strong>${escapeHtml(data.userName)}</strong>,</p>
    <p style="margin:0 0 10px; color:${BRAND.text}; font-weight:700;">Action Required: Your Order is Arriving.</p>

    <!-- Seller Utility (Safe Zone) -->
    <div style="background:#f7fafb; border:1px solid ${BRAND.border}; border-radius:10px; padding:14px; margin:12px 0;">
      <p style="margin:0 0 6px; font-weight:700; color:${BRAND.midnightNavy};">Seller Contact</p>
      <p style="margin:0 0 8px; color:${BRAND.text};">${escapeHtml(data.seller.shopName)}${data.seller.location ? ` • ${escapeHtml(data.seller.location)}` : ''}</p>
      <div style="text-align:left; margin-top:8px;">
        <a href="tel:${data.seller.phoneNumber || ''}" style="display:inline-block; background:${BRAND.white}; color:${BRAND.midnightNavy}; padding:10px 14px; border-radius:8px; text-decoration:none; border:1px solid ${BRAND.border}; font-weight:700;">📞 Call Seller</a>
      </div>
    </div>

    ${codeBox}

    ${actionCard}

    <h3 style="margin-top:18px; font-size:15px; color:${BRAND.midnightNavy};">Order Summary</h3>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;">
      <thead>
        <tr>
          <th style="text-align:left; color:${BRAND.muted}; padding-bottom:8px;">Item</th>
          <th style="text-align:center; color:${BRAND.muted}; padding-bottom:8px;">Qty</th>
          <th style="text-align:right; color:${BRAND.muted}; padding-bottom:8px;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding-top:12px; text-align:right; font-weight:700;">Subtotal:</td>
          <td style="padding-top:12px; text-align:right;">MK ${data.subtotal.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align:right; color:${BRAND.muted};">Delivery:</td>
          <td style="text-align:right; color:${BRAND.muted};">MK ${data.deliveryFee.toLocaleString()}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:10px; text-align:right; font-weight:800; color:${BRAND.sankhaTeal};">Total:</td>
          <td style="padding-top:10px; text-align:right; font-weight:800; color:${BRAND.sankhaTeal};">MK ${data.total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    ${remoteTip}
  `;

  const subject = `Action Required: Your order is arriving — ${data.seller.shopName}`;

  return {
    subject,
    html: baseTemplate('Action Required: Your Order is Arriving.', `Release code for ${data.orderNumber}`, content),
    text: `Release code ${data.releaseCode} for ${data.seller.shopName}. Visit ${data.frontendUrl}/orders/${data.orderId}`,
  };
};

// Minimal helper to escape HTML in basic contexts
function escapeHtml(s: string) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Keep an exported simple notification template for other uses
export const notificationTemplate = (data: { userName: string; title: string; message: string; ctaText?: string; ctaUrl?: string; type?: 'info'|'success'|'warning'|'error' }) => {
  const typeColors: Record<string,string> = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };
  const color = typeColors[data.type || 'info'];
  const cta = data.ctaText && data.ctaUrl ? `<div style="text-align:center; margin-top:12px;"><a href="${data.ctaUrl}" style="background:${color}; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:700;">${data.ctaText}</a></div>` : '';
  const messageHtml = `<p>Hi <strong>${escapeHtml(data.userName)}</strong>,</p><div style="color:${BRAND.text};">${data.message}</div>${cta}`;
  return {
    subject: data.title,
    html: baseTemplate(data.title, data.title, messageHtml),
    text: `${data.title}\n\nHi ${data.userName},\n\n${data.message.replace(/<[^>]*>/g,'')}${data.ctaUrl ? `\n\n${data.ctaText}: ${data.ctaUrl}` : ''}`,
  };
};

/**
 * Seller Payout Template
 * Notifies seller that payment is secured in escrow and includes buyer contact + optional maps link
 */
export const sellerPayoutTemplate = (params: {
  sellerName?: string;
  amount: number;
  orderNumber: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerLat?: number | null;
  buyerLng?: number | null;
  dashboardUrl: string;
}) => {
  const amountStr = Number(params.amount).toLocaleString();
  const mapsLink = (params.buyerLat && params.buyerLng) ? `https://www.google.com/maps/search/?api=1&query=${params.buyerLat},${params.buyerLng}` : '';

  const subject = `Payment Secured in Escrow — Order #${params.orderNumber}`;
  const content = `
    <div style="background:#002147;color:#fff;padding:14px;border-radius:8px;margin-bottom:12px;"><h2 style="margin:0">Payment Secured in Escrow</h2></div>
    <div style="border:2px solid ${BRAND.sankhaTeal}; padding:12px; border-radius:8px; background:#fff; color:${BRAND.midnightNavy};">
      <p style="margin:0 0 6px;"><strong>MK ${amountStr}</strong> is held securely in escrow.</p>
      <p style="margin:0 0 6px;">Obtain the 6-digit Release Code from the buyer to be paid.</p>
    </div>
    <section style="margin-top:12px; background:#fff; padding:12px; border-radius:8px; border:1px solid ${BRAND.border};">
      <div><strong>Buyer:</strong> ${params.buyerName || ''}</div>
      <div><strong>Delivery Address:</strong> ${params.buyerAddress || ''}</div>
      <div><strong>Phone:</strong> ${params.buyerPhone || ''}</div>
      ${mapsLink ? `<div style="margin-top:8px;"><a href="${mapsLink}" style="color:${BRAND.sankhaTeal}">View Delivery Destination on Google Maps</a></div>` : ''}
    </section>
    <div style="margin-top:12px;"><a href="${params.dashboardUrl}" style="display:inline-block;background:${BRAND.sankhaTeal}; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:700;">Open Order in Dashboard</a></div>
  `;

  return {
    subject,
    html: baseTemplate(subject, `Escrow secured for ${params.orderNumber}`, content),
    text: `MK ${amountStr} held in escrow for order #${params.orderNumber}. Get the release code from the buyer to be paid.`,
  };
};

export const bulkUploadSummaryTemplate = (data: { userName: string; subject: string; htmlSummary: string; textSummary?: string; ctaText?: string; ctaUrl?: string }) => {
  const content = `
    <p>Hi <strong>${escapeHtml(data.userName)}</strong>,</p>
    <div style="background:${BRAND.goldBg}; padding:12px; border-radius:8px;">${data.htmlSummary}</div>
  `;
  const cta = data.ctaText && data.ctaUrl ? `<div style="text-align:center; margin-top:12px;"><a href="${data.ctaUrl}" style="background:${BRAND.sankhaTeal}; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:700;">${data.ctaText}</a></div>` : '';
  return {
    subject: data.subject,
    html: baseTemplate(data.subject, data.subject, content + cta),
    text: data.textSummary || data.subject,
  };
};

export interface VerificationCodeData {
  userName: string;
  code: string;
  expiresInMinutes?: number;
}

export const verificationCodeTemplate = (data: VerificationCodeData) => {
  const content = `
    <p style="margin:0 0 12px;">Hi <strong>${escapeHtml(data.userName)}</strong>,</p>
    <div style="margin-top:12px; text-align:center;">
      <div style="display:inline-block; padding:18px 26px; background:${BRAND.white}; border:1px solid ${BRAND.border}; border-radius:8px; font-family: 'Courier New', monospace; font-weight:800; font-size:28px; letter-spacing:4px;">${data.code}</div>
    </div>
    <p style="margin-top:12px; color:${BRAND.muted};">This code is valid for ${data.expiresInMinutes ?? 10} minutes.</p>
  `;

  return {
    subject: 'Your verification code',
    html: baseTemplate('Verification Code', 'Your verification code', content),
    text: `Your verification code: ${data.code}`,
  };
};

export const passwordResetTemplate = (data: { userName: string; resetUrl: string; expiresInMinutes: number }) => {
  const content = `
    <p>Hi <strong>${escapeHtml(data.userName)}</strong>,</p>
    <p>Click the button below to reset your password.</p>
    <div style="text-align:center; margin-top:18px;">
      <a href="${data.resetUrl}" style="background:${BRAND.sankhaTeal}; color:#fff; padding:12px 18px; border-radius:8px; text-decoration:none; font-weight:700;">Reset Password</a>
    </div>
    <p style="margin-top:12px; color:${BRAND.muted};">This link expires in ${data.expiresInMinutes} minutes.</p>
  `;

  return {
    subject: 'Reset Your Sankha Password',
    html: baseTemplate('Reset Your Password', 'Password reset', content),
    text: `Reset your password: ${data.resetUrl}`,
  };
};

export const welcomeTemplate = (data: { userName: string; loginUrl: string }) => {
  const content = `
    <p>Welcome <strong>${escapeHtml(data.userName)}</strong> to Sankha.</p>
    <div style="margin-top:14px; text-align:center;"><a href="${data.loginUrl}" style="background:${BRAND.sankhaTeal}; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:700;">Go to Sankha</a></div>
  `;

  return {
    subject: 'Welcome to Sankha',
    html: baseTemplate('Welcome to Sankha', 'Welcome', content),
    text: `Welcome ${data.userName} - ${data.loginUrl}`,
  };
};
