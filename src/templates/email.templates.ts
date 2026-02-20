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
  buyerPhone?: string;
  buyerAddress?: string;
  recipientName?: string;
}

const baseTemplate = (title: string, preheader: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Prevent mobile email clients from automatically resizing text */
    body { margin:0; padding:0; background:#f5f7fa; font-family: Arial, Helvetica, sans-serif; font-size:16px; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    a { color: ${BRAND.sankhaTeal}; }
    img { max-width:100%; height:auto; }
  </style>
</head>
<body>
  <div style="display:none; max-height:0; overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fa; padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background:${BRAND.white}; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background:${BRAND.midnightNavy}; padding:22px 28px; color:#fff;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:800; font-size:20px;">Sankha</div>
                <div style="font-size:11px; opacity:0.9; text-transform:uppercase;">Malawi's Trusted Marketplace</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px; color:${BRAND.text}; font-size:16px; line-height:1.45;">
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
                  © 2026 Sankha — Lilongwe, Malawi.
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

  // Monospaced secure code box (gold background, distinct for action)
  const codeBox = data.releaseCode ? `
    <div style="margin:18px 0; text-align:center;">
      <div style="display:inline-block; padding:14px 22px; background:${BRAND.goldBg}; border:1px solid ${BRAND.border}; border-radius:8px; font-family: 'Courier New', monospace; font-weight:800; font-size:24px; letter-spacing:6px; color:${BRAND.text};">${data.releaseCode}</div>
    </div>
  ` : '';

  // Action card (main verification CTA; release code box is primary action area)
  const actionCard = `
    <div style="background:#ffffff; border:1px solid ${BRAND.border}; border-radius:10px; padding:16px; margin:18px 0;">
      <p style="margin:0 0 8px; font-weight:700; color:${BRAND.midnightNavy};">Verification</p>
      <p style="margin:0 0 12px; color:${BRAND.text};">You are paying <strong>${escapeHtml(data.seller.shopName)}</strong> - <strong>MK ${data.total.toLocaleString()}</strong></p>

      <div style="text-align:center; margin-top:8px;">
        ${data.seller.phoneNumber ? `<span style="display:inline-block; padding:6px 0; font-weight:800; color:${BRAND.midnightNavy}; margin:0 8px 8px 0;">${escapeHtml(data.seller.phoneNumber)}</span>` : `<span style="display:inline-block; color:#94a3b8; margin:0 8px 8px 0;">Not available</span>`}

        ${data.seller.phoneNumber ? `<a href="tel:${data.seller.phoneNumber}" style="display:inline-block; background:${BRAND.sankhaTeal}; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:700; margin:0 8px 8px 0;">📞 Call Seller</a>` : `<span style="background:#f1f5f9; padding:10px 14px; border-radius:8px; display:inline-block; color:#94a3b8; border:1px solid ${BRAND.border}; margin:0 8px 8px 0;">📞 Call Seller</span>`}

        <a href="${data.frontendUrl.replace(/\/$/, '')}/confirm/${encodeURIComponent(data.orderId)}?code=${encodeURIComponent(data.releaseCode)}" style="display:inline-block; background:${BRAND.sankhaTeal}; color:#fff; padding:12px 18px; border-radius:8px; text-decoration:none; font-weight:800; margin:0 8px 8px 0;">I Have the Items &amp; I'm Satisfied</a>
      </div>

      <p style="margin:12px 0 0; color:#8b1f1f; font-weight:700; font-size:14px;">⚠️ Only click this after physical inspection. This releases funds from escrow and cannot be undone.</p>
    </div>
  `;

  const remoteTip = `<p style="color:${BRAND.muted}; font-size:14px;">If arriving via bus or courier, inspect items at the depot first, then call the seller with your code before releasing payment.</p>`;

  const content = `
    <p style="margin:0 0 12px; color:${BRAND.text};">Hi <strong>${escapeHtml(data.userName)}</strong>,</p>
      ${data.recipientName && data.recipientName !== data.userName ? `<p style="margin:6px 0 12px; color:${BRAND.muted}; font-weight:600;">Your gift for <strong>${escapeHtml(data.recipientName)}</strong> is on its way!</p>` : ''}
    <p style="margin:0 0 10px; color:${BRAND.text}; font-weight:700;">Action Required: Your Order is Arriving.</p>
    <p style="margin:6px 0 12px; color:${BRAND.muted};">Order #: <strong>${escapeHtml(data.orderNumber || data.orderId)}</strong></p>

    <!-- Seller Utility (Safe Zone) styled as boxed command center -->
    <div style="background:#fff; border:1px solid ${BRAND.border}; border-radius:10px; padding:14px; margin:12px 0;">
      <p style="margin:0 0 6px; font-weight:700; color:${BRAND.midnightNavy};">Seller Contact</p>
      <p style="margin:0 0 8px; color:${BRAND.text}; font-weight:700;">${escapeHtml(data.seller.shopName)}${data.seller.location ? ` • ${escapeHtml(data.seller.location)}` : ''}</p>
      <div style="margin-top:8px; color:${BRAND.text}; font-size:15px;">
        <div style="margin-bottom:6px;"><strong>Phone:</strong> <span style="font-weight:800;">${data.seller.phoneNumber ? escapeHtml(data.seller.phoneNumber) : '<span style="color:#9ca3af;">Not available</span>'}</span></div>
      </div>
      <div style="text-align:left; margin-top:8px;">
        ${data.seller.phoneNumber ? `<a href="tel:${data.seller.phoneNumber}" style="display:inline-block; background:${BRAND.sankhaTeal}; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:700;">📞 Call Seller</a>` : `<span style="display:inline-block; background:#f1f5f9; color:#94a3b8; padding:10px 14px; border-radius:8px;">📞 Call Seller</span>`}

        ${
          data.seller.lat != null && data.seller.lng != null
            ? `<div style="margin-top:8px;"><a href="https://www.google.com/maps/search/?api=1&query=${data.seller.lat},${data.seller.lng}" style="color:${BRAND.sankhaTeal}; text-decoration:none; display:inline-flex; align-items:center;"><img src="https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png" width="18" height="18" style="margin-right:8px;" alt="Map pin"/>View Shop Location on Google Maps</a></div>`
            : (data.seller.location ? `<div style="margin-top:8px;"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.seller.location)}" style="color:${BRAND.sankhaTeal}; text-decoration:none; display:inline-flex; align-items:center;"><img src="https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png" width="18" height="18" style="margin-right:8px;" alt="Map pin"/>Search Shop Location on Google Maps</a></div>` : `<div style="margin-top:8px; color:#d97706; font-weight:700;">📍 Shop location unavailable</div>`)
        }
      </div>
    </div>

    ${codeBox}

    ${actionCard}

    <!-- Delivery Details -->
    <div style="background:#fff; border:1px solid ${BRAND.border}; border-radius:8px; padding:12px; margin-top:14px;">
      <p style="margin:0 0 8px; font-weight:700; color:${BRAND.midnightNavy};">Delivery Details</p>
      <div style="color:${BRAND.text}; font-size:14px;">
        <div style="margin-bottom:6px;"><strong>Address:</strong> ${data.buyerAddress ? escapeHtml(data.buyerAddress) : '<span style="color:#9ca3af;">Not available</span>'}</div>
        <div style="margin-bottom:6px;"><strong>Phone:</strong> ${data.buyerLocation || data.buyerPhone ? (data.buyerPhone ? `<a href="tel:${data.buyerPhone}" style="color:${BRAND.midnightNavy}; text-decoration:none;">${escapeHtml(data.buyerPhone)}</a>` : '<span style="color:#9ca3af;">Not available</span>') : '<span style="color:#9ca3af;">Not available</span>'}</div>
        ${data.buyerLocation && data.buyerLocation.lat != null && data.buyerLocation.lng != null ? `<div style="margin-top:6px;"><a href="https://www.google.com/maps/search/?api=1&query=${data.buyerLocation.lat},${data.buyerLocation.lng}" style="color:${BRAND.sankhaTeal}; text-decoration:none; display:inline-flex; align-items:center;"><img src="https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png" width="18" height="18" style="margin-right:8px;" alt="Map pin"/>View Delivery Destination on Google Maps</a></div>` : ''}
      </div>
    </div>

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
          <td colspan="2" style="padding-top:10px; text-align:right; font-weight:800; font-size:18px;">Total Secured in Escrow:</td>
          <td style="padding-top:10px; text-align:right; font-weight:800; font-size:18px; color:${BRAND.sankhaTeal};">MK ${data.total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    ${remoteTip}
  `;

  const subject = `Action Required: Your order is arriving — ${data.seller.shopName}${data.orderNumber ? ` (Order ${data.orderNumber})` : ''}`;

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
  buyerInstructions?: string;
  dashboardUrl: string;
  items?: OrderItem[];
}) => {
  const amountStr = Number(params.amount).toLocaleString();
  const mapsLink = (params.buyerLat != null && params.buyerLng != null) ? `https://www.google.com/maps/search/?api=1&query=${params.buyerLat},${params.buyerLng}` : '';
  const addressLink = params.buyerAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.buyerAddress)}` : '';

  const subject = `New Sale: MK ${amountStr} Secured for Order #${params.orderNumber}`;

  const itemsHtml = (params.items || []).map(i => `
    <tr>
      <td style="padding:10px 8px; border-bottom:1px solid ${BRAND.border};">${escapeHtml(i.name)}</td>
      <td style="padding:10px 8px; border-bottom:1px solid ${BRAND.border}; text-align:center;">${i.quantity}</td>
      <td style="padding:10px 8px; border-bottom:1px solid ${BRAND.border}; text-align:right;">MK ${Number(i.price).toLocaleString()}</td>
    </tr>
  `).join('');

  const content = `
    <div style="background:${BRAND.midnightNavy}; color:#fff; padding:14px; border-radius:8px; margin-bottom:12px; text-align:center;">
      <h2 style="margin:0; font-size:20px;">Payment Secured in Escrow</h2>
      <div style="margin-top:6px; font-weight:600;">MK ${amountStr} is held securely in Sankha Escrow for Order #${params.orderNumber}</div>
    </div>

    <!-- Logistics Card: Recipient Details (Anchor & Guide) -->
    <div style="background:#fff; border:1px solid ${BRAND.border}; border-radius:8px; padding:12px; margin-bottom:12px;">
      <p style="margin:0 0 8px; font-weight:700; color:${BRAND.midnightNavy};">Dispatch Command Center — Recipient Details</p>
      <div style="margin-bottom:8px; color:${BRAND.text};">
        <div style="margin-bottom:6px;"><strong>Name:</strong> <span style="font-weight:800;">${params.buyerName ? escapeHtml(params.buyerName) : '<span style="color:#9ca3af;">Not available</span>'}</span></div>
        <div style="margin-bottom:6px;"><strong>Contact:</strong> <span style="font-weight:800;">${params.buyerPhone ? escapeHtml(params.buyerPhone) : '<span style="color:#9ca3af;">Not available</span>'}</span></div>
        ${mapsLink ? `<div style="margin-bottom:6px;"><a href="${mapsLink}" style="color:${BRAND.sankhaTeal}; text-decoration:none; display:inline-flex; align-items:center;"><img src="https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png" width="18" height="18" style="margin-right:8px;" alt="Map pin"/>📍 Open Navigation to Recipient</a></div>` : (params.buyerAddress ? `<div style="margin-bottom:6px;"><a href="${addressLink}" style="color:${BRAND.sankhaTeal}; text-decoration:none; display:inline-flex; align-items:center;"><img src="https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png" width="18" height="18" style="margin-right:8px;" alt="Map pin"/>📍 Search Delivery Point on Google Maps</a></div>` : `<div style="margin-bottom:6px; color:#d97706; font-weight:700;">📍 Live location unavailable</div>`)}
        <div style="margin-top:8px; background:#f8fafc; border:1px solid ${BRAND.border}; padding:10px; border-radius:6px;"><strong>Driver Instructions:</strong><div style="margin-top:6px; color:${BRAND.text};">${params.buyerInstructions ? escapeHtml(params.buyerInstructions) : '<span style="color:#9ca3af;">No instructions provided</span>'}</div></div>
        <div style="margin-top:6px;"><strong>Delivery Address:</strong><div style="margin-top:6px; color:${BRAND.text};">${params.buyerAddress ? escapeHtml(params.buyerAddress) : '<span style="color:#9ca3af;">Not available</span>'}</div></div>
      </div>
    </div>

    <!-- Escrow Handshake / Next Steps (light background) -->
    <div style="background:#ffffff; border:1px solid ${BRAND.border}; border-radius:8px; padding:12px; margin-bottom:12px;">
      <p style="margin:0 0 8px; font-weight:700; color:${BRAND.midnightNavy};">Next Steps</p>
      <ol style="margin:0 0 0 18px; color:${BRAND.text};">
        <li>Ship the items listed below to the buyer’s location.</li>
        <li>Once the buyer inspects the goods, they will provide you with a 6-digit Release Code.</li>
        <li>Enter this code in your Seller Dashboard or ask the buyer to click "Confirm Receipt" in their email to instantly release <strong>MK ${amountStr}</strong> to your wallet.</li>
      </ol>
    </div>

    <!-- Itemized Order Summary (Recipient Waybill) -->
    <h3 style="margin-top:6px; font-size:15px; color:${BRAND.midnightNavy};">Itemized Order (Waybill)</h3>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left; color:${BRAND.muted}; padding:8px;">Product</th>
          <th style="text-align:center; color:${BRAND.muted}; padding:8px;">Qty</th>
          <th style="text-align:right; color:${BRAND.muted}; padding:8px;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding-top:12px; text-align:right; font-weight:700;">Total Payout:</td>
          <td style="padding-top:12px; text-align:right; font-weight:800; color:${BRAND.sankhaTeal};">MK ${amountStr}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:14px;"><a href="${params.dashboardUrl}" style="display:inline-block;background:${BRAND.sankhaTeal}; color:#fff; padding:12px 16px; border-radius:8px; text-decoration:none; font-weight:800;">Manage Order in Dashboard</a></div>
  `;

  return {
    subject,
    html: baseTemplate(subject, `Escrow secured for ${params.orderNumber}`, content),
    text: `MK ${amountStr} secured in escrow for order #${params.orderNumber}. Manage at ${params.dashboardUrl}`,
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
