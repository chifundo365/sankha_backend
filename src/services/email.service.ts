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
    shopName?: string;
    sellerPhone?: string;
    buyerPhone?: string;
    sellerLocation?: string;
    items?: OrderItem[];
    subtotal?: number;
    deliveryFee?: number;
    total?: number;
    // allow nested ReleaseCodeData shape as well
    seller?: any;
  }
): Promise<EmailResult> => {
  // Compose data for the unified order confirmation/release template
  const frontend = data.frontendUrl || emailConfig.app.url;
  // Support both flat and nested data shapes
  const sellerInfo = data.seller ? data.seller : { shopName: data.shopName, phoneNumber: data.sellerPhone, location: data.sellerLocation };
  const seller: SellerInfo = { shopName: sellerInfo.shopName, phoneNumber: sellerInfo.phoneNumber, location: sellerInfo.location };
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
    seller: { shopName: seller.shopName, phoneNumber: seller.phoneNumber, location: seller.location, lat: (data as any).seller?.lat ?? undefined, lng: (data as any).seller?.lng ?? undefined },
    // include buyer delivery info when provided so templates can render address/phone/maps
    buyerLocation: (data as any).buyerLocation ?? null,
    buyerPhone: data.buyerPhone || undefined,
    buyerAddress: (data as any).buyerAddress || undefined,
  };

  // Build a buyer-facing email with clear Release Code Action Zone
  const mapsLink = payload.buyerLocation?.lat && payload.buyerLocation?.lng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${payload.buyerLocation.lat},${payload.buyerLocation.lng}`)}` : '';

  const html = `
  <div style="font-family: Arial, sans-serif; color:#111;">
    <div style="background:#002147;padding:18px;color:#fff;text-align:left;">
      <h1 style="margin:0;font-size:20px">Sankha</h1>
    </div>
    <div style="padding:20px; background:#fff; border:1px solid #eaeaea;">
      <p style="font-size:16px;margin:0 0 12px 0">Hi ${payload.userName || 'Customer'},</p>
      <p style="font-size:16px;margin:0 0 12px 0">Your order <strong>#${payload.orderNumber}</strong> is secured. Share the Release Code only after the recipient confirms they have the goods.</p>

      <div style="background:#FFD700;padding:16px;border-radius:6px;margin:18px 0;text-align:center">
        <div style="font-size:24px;font-weight:700;letter-spacing:4px;font-family:monospace">${payload.releaseCode || ''}</div>
        <div style="margin-top:8px;font-size:14px;font-weight:700">Inspection Warning: Do NOT share this code until recipient inspects the items.</div>
      </div>
      ${mapsLink ? `<p style="font-size:16px;margin:0 0 12px 0">Delivery anchor: <a href="${mapsLink}">${payload.buyerAddress || 'View map'}</a></p>` : ''}

      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:16px">
        <tr><td style="padding:6px 8px">Subtotal</td><td style="padding:6px 8px;text-align:right">MWK ${((payload.subtotal||0)).toLocaleString()}</td></tr>
        <tr><td style="padding:6px 8px">Delivery</td><td style="padding:6px 8px;text-align:right">MWK ${((payload.deliveryFee||0)).toLocaleString()}</td></tr>
        <tr style="border-top:2px solid #ddd;font-weight:700"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">MWK ${((payload.total||0)).toLocaleString()}</td></tr>
      </table>

      <p style="font-size:16px;margin:12px 0 0 0">Seller: <strong>${payload.seller?.shopName || ''}</strong> — Call: <a href="tel:${payload.seller?.phoneNumber || ''}">${payload.seller?.phoneNumber || 'Not available'}</a></p>

      <p style="font-size:14px;color:#666;margin-top:18px">This code releases escrow. Only provide it to the delivery person once the recipient confirms receipt of goods.</p>
    </div>
  </div>
  `;

  return sendEmail({
    to: email,
    subject: `Your Release Code — Order #${payload.orderNumber}`,
    html,
    tags: [
      { name: 'category', value: 'release-code' },
      { name: 'order_number', value: data.orderNumber },
    ],
  });
};

/**
 * Send the seller-facing Dispatch Command Center email when order is ready or updated
 */
export const sendSellerDispatchEmail = async (
  email: string,
  data: {
    orderId: string;
    orderNumber: string;
    shopName: string;
    buyerName: string;
    recipientName: string;
    recipientPhone?: string;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    deliveryDirections?: string;
    depotName?: string | null;
    depotLat?: number | null;
    depotLng?: number | null;
    preferredCarrierDetails?: string;
    packageLabelText?: string;
    items?: OrderItem[];
    deliveryFee?: number;
  }
): Promise<EmailResult> => {
  const mapsLink = data.deliveryLat && data.deliveryLng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.deliveryLat},${data.deliveryLng}`)}` : (data.depotLat && data.depotLng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.depotLat},${data.depotLng}`)}` : '');

  const itemsHtml = (data.items || []).map(i => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.name}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">MWK ${i.price.toLocaleString()}</td></tr>`).join('');

  const html = `
  <div style="font-family: Arial, sans-serif; color:#111;">
    <div style="background:#002147;padding:18px;color:#fff;text-align:left;">
      <h1 style="margin:0;font-size:20px">Dispatch Command Center</h1>
    </div>
    <div style="padding:20px; background:#fff; border:1px solid #eaeaea;">
      <p style="font-size:16px;margin:0 0 12px 0">Order <strong>#${data.orderNumber}</strong> — Please prepare for pickup/delivery.</p>
      <p style="font-size:16px;margin:0 0 12px 0">Recipient: <strong>${data.recipientName}</strong><br/>Phone: <strong>${data.recipientPhone || 'Not available'}</strong></p>
      ${data.depotName ? `<p style="font-size:16px;margin:6px 0 12px 0"><strong>Drop-off at:</strong> ${data.depotName}</p>` : ''}
      ${mapsLink ? `<p style="margin:12px 0"><a href="${mapsLink}" style="display:inline-block;background:#2EC4B6;color:#002147;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:600">📍 Navigate to Recipient</a></p>` : ''}

      ${data.deliveryDirections ? `<div style="margin-top:12px;padding:12px;border:1px solid #ddd;background:#f9f9f9"><strong>Driver Notes:</strong><div style="margin-top:6px">${data.deliveryDirections}</div></div>` : ''}
      ${data.preferredCarrierDetails ? `<div style="margin-top:12px;padding:12px;border:1px solid #ddd;background:#f9f9f9"><strong>Carrier Instructions:</strong><div style="margin-top:6px">${data.preferredCarrierDetails}</div></div>` : ''}

      ${data.packageLabelText ? `<div style="margin-top:16px;padding:14px;border-radius:6px;background:#fff6e5;border:1px solid #ffdca3;text-align:center;font-size:18px;font-weight:700">📦 WRITE ON BOX: ${data.packageLabelText}</div>` : ''}

      <p style="margin-top:12px"><a href="${emailConfig.app.url}/seller/orders/${data.orderId}/upload-waybill" style="display:inline-block;background:#2EC4B6;color:#002147;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:600">Upload Waybill / Bus Receipt</a></p>

      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">Item</th><th style="text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">Qty</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Price</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <p style="margin-top:12px;font-size:16px"><strong>Note:</strong> Buyer has paid MWK ${data.deliveryFee ? Number(data.deliveryFee).toLocaleString() : '0'} for transport costs.</p>

      <p style="margin-top:18px;font-size:14px;color:#666">Manage this order in your dashboard: <a href="${emailConfig.app.url}/seller/orders/${data.orderId}">${emailConfig.app.url}/seller/orders/${data.orderId}</a></p>
    </div>
  </div>
  `;

  return sendEmail({
    to: email,
    subject: `Dispatch: Order #${data.orderNumber}`,
    html,
    tags: [{ name: 'category', value: 'dispatch' }, { name: 'order_number', value: data.orderNumber }],
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
        shops: {
          include: {
            users: true, // include shop owner user record if present
          }
        },
        order_items: true,
        user_addresses: true,
      },
    });

    if (!order) return { success: false, error: 'Order not found' };

    // DEBUG: dump key order relations and phone fields to help diagnose missing phone values
    try {
      console.log('sendReleaseCodeForOrder DEBUG - order snapshot:', JSON.stringify({
        id: order.id,
        order_number: (order as any).order_number || null,
        users: order.users || null,
        shops: order.shops || null,
        user_addresses: (order as any).user_addresses || null,
        order_items: (order as any).order_items || null,
      }, null, 2));

      const debugPhones = {
        buyer_phone_user_phone_number: (order.users as any)?.phone_number || null,
        buyer_phone_user_phone: (order.users as any)?.phone || null,
        shop_phone_phone_number: (order.shops as any)?.phone_number || null,
        shop_phone_phone: (order.shops as any)?.phone || null,
        shop_user_phone_number: (order.shops as any)?.users?.phone_number || null,
        shop_user_phone: (order.shops as any)?.users?.phone || null,
        order_seller_phone: (order as any)?.seller_phone || null,
        order_sellerPhone: (order as any)?.sellerPhone || null,
      };
      console.log('sendReleaseCodeForOrder DEBUG - phone candidates:', JSON.stringify(debugPhones, null, 2));
    } catch (dbgErr) {
      console.warn('sendReleaseCodeForOrder DEBUG failed to stringify order:', dbgErr);
    }

    const buyerEmail = order.users?.email;
    if (!buyerEmail) return { success: false, error: 'Buyer email not available' };

    const items: OrderItem[] = (order.order_items || []).map((it: any) => ({ name: it.product_name, quantity: it.quantity, price: Number(it.base_price ?? it.unit_price ?? 0) }));

    const releaseCode = order.release_code || '';

    // Prefer delivery address phone (user_addresses) over user record, normalize '+' for display
    const delivery = Array.isArray((order as any).user_addresses) ? (order as any).user_addresses[0] : (order as any).user_addresses || null;
    let buyerPhoneRaw = delivery?.phone_number || delivery?.phone || (order.users as any)?.phone_number || (order.users as any)?.phone || '';
    const normalizeDisplayPhone = (p: any) => {
      if (!p) return '';
      const s = String(p).trim();
      if (s.startsWith('+')) return s;
      // if it looks numeric, prefix '+'
      if (/^\d+$/.test(s)) return `+${s}`;
      return s;
    };
    const buyerPhone = normalizeDisplayPhone(buyerPhoneRaw);

    // Determine recipient snapshot values (order-level snapshot fields take precedence)
    const recipientName = (order as any)?.recipient_name || delivery?.contact_name || `${order.users?.first_name || ''} ${order.users?.last_name || ''}`.trim();
    const recipientPhoneRaw = (order as any)?.recipient_phone || delivery?.phone_number || delivery?.phone || '';
    const data = {
      userName: `${order.users?.first_name || ''} ${order.users?.last_name || ''}`.trim() || 'Customer',
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      releaseCode,
      frontendUrl: emailConfig.app.url,
      shopName: order.shops?.name || 'Seller',
      // Resolve seller phone from multiple possible fields (shop.phone_number, shop.phone, shop.users.phone, order fallback)
      sellerPhone: (order.shops as any)?.phone_number || (order.shops as any)?.phone || (order.shops as any)?.users?.phone_number || (order.shops as any)?.users?.phone || (order as any)?.seller_phone || (order as any)?.sellerPhone || '',
      sellerLocation: (order.shops as any)?.city || '',
      buyerPhone,
      recipientName,
      items,
      subtotal: Number(order.total_amount ?? items.reduce((s,i)=>s + i.price*i.quantity,0)),
      deliveryFee: Number((order as any).delivery_fee ?? (order as any).deliveryFee ?? 0),
      total: Number(order.total_amount ?? 0),
    };

    // Extract lat/lng if present on shop or order (tolerant to field names)
    const shopLat = (order.shops as any)?.lat ?? (order.shops as any)?.latitude ?? null;
    const shopLng = (order.shops as any)?.lng ?? (order.shops as any)?.longitude ?? null;
    // delivery address is stored on user_addresses relation (array)
    // (reuse earlier `delivery` variable declared above)
    const buyerLat = delivery?.latitude ?? delivery?.lat ?? (order as any)?.delivery_lat ?? (order as any)?.buyer_lat ?? null;
    const buyerLng = delivery?.longitude ?? delivery?.lng ?? (order as any)?.delivery_lng ?? (order as any)?.buyer_lng ?? null;
    const buyerAddressString = delivery
      ? `${delivery?.address_line1 || delivery?.address_line || delivery?.address || ''}${delivery?.city ? ', ' + delivery?.city : ''}`
      : ((order as any)?.delivery_address || (order as any)?.deliveryAddress || '');

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
      buyerAddress: buyerAddressString,
      buyerPhone: buyerPhone,
      recipientName: recipientName,
    };

    const buyerEmailResult = await sendReleaseCodeEmail(buyerEmail, buyerPayload as any);

    // Send buyer SMS (if phone exists)
    try {
      if (data.buyerPhone) {
        const logisticsPath = (order as any)?.depot_name ? 'DEPOT' : 'HOME';
        const driverHintLink = `${emailConfig.app.url}/orders/${order.id}`;
        const smsBuyer = await smsService.sendBuyerDeliverySms(data.buyerPhone, {
          logisticsPath: logisticsPath as any,
          driverHintLink: driverHintLink,
          code: data.releaseCode,
          sellerPhone: data.sellerPhone || '',
          carrierName: (order as any)?.preferred_carrier_details || data.shopName,
          waybillNumber: (order as any)?.waybill_number || undefined,
          depotName: (order as any)?.depot_name || undefined,
          labelText: (order as any)?.package_label_text || undefined,
        });
        console.log('sendReleaseCodeForOrder buyer SMS:', smsBuyer);
      }
    } catch (smsErr) {
      console.error('sendReleaseCodeForOrder buyer SMS error:', smsErr);
    }

    // Send seller email & SMS (if seller contact exists)
    try {
      // Resolve seller email from multiple possible fields (shop.email or shop.users.email)
      const shopObj = (order.shops as any) || {};
      const sellerEmail = shopObj.email || shopObj.users?.email || (order as any)?.seller_email || '';
      console.log('sendReleaseCodeForOrder resolved sellerEmail=', sellerEmail);
      // If sellerPhone is empty, log the shop object to help debugging missing fields
      if (!data.sellerPhone) {
        console.warn('sendReleaseCodeForOrder: sellerPhone not found on order. shop object:', JSON.stringify(shopObj));
      }
      if (sellerEmail) {
        console.log(`Sending seller dispatch email for order ${data.orderNumber} to ${sellerEmail}`);
        try {
          const dispatchRes = await sendSellerDispatchEmail(sellerEmail, {
            orderId: data.orderId,
            orderNumber: data.orderNumber,
            shopName: (order.shops as any)?.name || '',
            buyerName: recipientName || data.userName,
            recipientName: recipientName || data.userName,
            recipientPhone: data.buyerPhone,
            deliveryLat: buyerLat,
            deliveryLng: buyerLng,
            deliveryDirections: (order as any)?.delivery_directions || '',
            depotName: (order as any)?.depot_name || undefined,
            depotLat: (order as any)?.depot_lat ?? undefined,
            depotLng: (order as any)?.depot_lng ?? undefined,
            preferredCarrierDetails: (order as any)?.preferred_carrier_details || undefined,
            packageLabelText: (order as any)?.package_label_text || undefined,
            deliveryFee: Number((order as any)?.delivery_fee ?? 0),
            items,
          });
          console.log('sendReleaseCodeForOrder seller dispatch email result:', dispatchRes);
        } catch (e) {
          console.error('Failed to send seller dispatch email', e);
        }
      }
      const sellerPhone = data.sellerPhone || (order.shops as any)?.phone_number || (order.shops as any)?.phone || (order.shops as any)?.users?.phone_number || (order.shops as any)?.users?.phone || (order as any)?.seller_phone || '';
      console.log('sendReleaseCodeForOrder resolved sellerPhone=', sellerPhone);
      if (sellerPhone) {
        console.log(`Sending seller SMS for order ${data.orderNumber} to ${sellerPhone}`);
        const smsSeller = await smsService.sendSellerSms(
          sellerPhone,
          data.orderNumber,
          recipientName || data.userName,
          data.total || 0,
          data.buyerPhone || '',
          (order as any)?.delivery_directions || ''
        );
        console.log('sendReleaseCodeForOrder seller SMS result:', smsSeller);
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

/**
 * Notify seller that delivery location has been updated for an order
 */
export const sendSellerLocationUpdatedEmail = async (
  email: string,
  data: {
    orderId: string;
    orderNumber: string;
    shopName: string;
    buyerName: string;
    recipientName: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
    deliveryDirections?: string;
  }
): Promise<EmailResult> => {
  const mapsLink = data.deliveryLat && data.deliveryLng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.deliveryLat},${data.deliveryLng}`)}` : '';

  const html = `
  <div style="font-family: Arial, sans-serif; font-size:16px; color:#111;">
    <div style="background:#002147;padding:18px;color:#fff;text-align:left;">
      <h1 style="margin:0;font-size:20px">Dispatch Command Center</h1>
    </div>
    <div style="padding:20px;border:1px solid #eaeaea; background:#ffffff;">
      <p style="font-size:16px;margin:0 0 12px 0">Order <strong>#${data.orderNumber}</strong> — delivery location was updated.</p>
      <p style="margin:8px 0">Recipient: <strong>${data.recipientName || 'Recipient'}</strong><br/>Buyer: <strong>${data.buyerName}</strong></p>
      ${mapsLink ? `<p style="margin:12px 0"><a href="${mapsLink}" style="display:inline-block;background:#2EC4B6;color:#002147;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:600">📍 Navigate to Recipient</a></p>` : ''}
      ${data.deliveryDirections ? `<div style="margin-top:12px;padding:12px;border:1px solid #ddd;background:#f9f9f9"><strong>Driver Notes:</strong><div style="margin-top:6px">${data.deliveryDirections}</div></div>` : ''}
      <p style="margin-top:18px;font-size:14px;color:#666">This is an automated notification — please check the seller dashboard for full details.</p>
    </div>
  </div>
  `;

  return sendEmail({
    to: email,
    subject: `Delivery location updated — Order #${data.orderNumber}`,
    html,
    tags: [{ name: 'category', value: 'delivery-update' }, { name: 'order_number', value: data.orderNumber }],
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
  sendSellerDispatchEmail,
  sendWalletCredited: sendWalletCreditedEmail,
  sendWithdrawalCompleted: sendWithdrawalCompletedEmail,
  sendVerificationCode: sendVerificationCodeEmail,
  isConfigured: isEmailConfigured,
  sendSellerLocationUpdatedEmail,
};
