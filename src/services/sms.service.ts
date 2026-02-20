import axios from 'axios';
import querystring from 'querystring';

const AT_USERNAME = process.env.AFRICASTALKING_USERNAME || '';
const AT_API_KEY = process.env.AFRICASTALKING_API_KEY || '';
const AT_FROM = process.env.AFRICASTALKING_FROM || '';
const AT_SANDBOX = (process.env.AFRICASTALKING_SANDBOX || 'false') === 'true';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const AT_BASE = AT_SANDBOX
  ? 'https://api.sandbox.africastalking.com/version1/messaging'
  : 'https://api.africastalking.com/version1/messaging';

export interface SmsResult {
  success: boolean;
  data?: any;
  error?: string;
}

async function postToAT(form: Record<string, any>) {
  const payload = querystring.stringify(form);

  const res = await axios.post(AT_BASE, payload, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      apiKey: AT_API_KEY,
    },
    timeout: 10000,
  });

  return res.data;
}

function normalizeNumber(n: string) {
  const s = String(n || '').trim();
  if (!s) return '';
  if (s.startsWith('+')) return s;
  const digits = s.replace(/\D/g, '');
  return digits ? `+${digits}` : s;
}

export function buildReleaseSms(shopName: string, code: string, sellerPhone: string, orderId: string): string {
  // Constraints: GSM-7 only (no emojis), max 160 chars
  const maxLen = 160;
  const maxShop = 10;
  const shortShop = (shopName || '').slice(0, maxShop);
  const shortOrder = String(orderId || '').slice(0, 5); // 5-character order short id
  const shortLink = FRONTEND_URL ? `${FRONTEND_URL.replace(/\/$/, '')}/o/${encodeURIComponent(shortOrder)}` : `https://sankha.example/o/${encodeURIComponent(shortOrder)}`;

  let msg = `SANKHA: MK${''} for ${shortShop} is SECURED. Provide Code ${code} to Seller ONLY after you get items. This releases payment. Call: ${sellerPhone}. View: ${shortLink}`;

  // remove non GSM-7 / unicode characters (simple conservative filter)
  msg = stripToGSM7(msg);

  if (msg.length <= maxLen) return msg;

  // If too long, shorten link and drop some optional words
  const minimalLink = `${shortLink.replace(/https?:\/\//, '').replace(/^www\./, '')}`;
  msg = `SANKHA: MK for ${shortShop} is SECURED. Code ${code}. Call: ${sellerPhone}. ${minimalLink}`;
  msg = stripToGSM7(msg).slice(0, maxLen);
  return msg;
}

export function buildBuyerSms(amount: number | string, shopName: string, code: string, sellerPhone: string, orderId: string): string {
  const amt = Number(amount || 0).toLocaleString();
  const shortShop = (shopName || '').slice(0, 10);
  const shortOrder = String(orderId || '').slice(0, 5);
  const shortLink = FRONTEND_URL ? `${FRONTEND_URL.replace(/\/$/, '')}/o/${encodeURIComponent(shortOrder)}` : `https://sankha.example/o/${encodeURIComponent(shortOrder)}`;
  let msg = `SANKHA: MK${amt} for ${shortShop} is SECURED. Provide Code ${code} to Seller ONLY after you get items. This releases payment. Call: ${sellerPhone}. View: ${shortLink}`;
  msg = stripToGSM7(msg);
  return msg.length <= 160 ? msg : msg.slice(0, 160);
}

export function buildSellerSms(orderNum: string, buyerName: string, amount: number | string, buyerPhone: string, deliveryDirections?: string): string {
  const amt = Number(amount || 0).toLocaleString();
  // Prefer a short numeric order id when possible (e.g., ORD-2026-000021 -> 21)
  let shortOrder = String(orderNum || '');
  const m = shortOrder.match(/(\d+)$/);
  if (m) shortOrder = m[1];

  const displayBuyerPhone = normalizeNumber(String(buyerPhone || '')).replace(/\D/g, '');
  const buyerPhoneLabel = displayBuyerPhone ? `+${displayBuyerPhone}` : (buyerPhone || 'Not available');

  let msg = `SANKHA: Order #${shortOrder} for ${buyerName} is ready. Once they inspect goods, ask them for the Release Code to get your MK${amt}. Call Recipient: ${buyerPhoneLabel}`;
  // Append short delivery directions snippet when available
  if (deliveryDirections) {
    const snippet = deliveryDirections.replace(/\s+/g, ' ').trim().slice(0, 60);
    msg = `${msg} Directions: ${snippet}`;
  }
  msg = stripToGSM7(msg);
  if (msg.length <= 160) return msg;

  // Fallback shorter version
  msg = `SANKHA: Order #${shortOrder} ready. After inspection ask for Release Code to get MK${amt}. Call Recipient: ${buyerPhoneLabel}`;
  if (deliveryDirections) {
    const snippet = deliveryDirections.replace(/\s+/g, ' ').trim().slice(0, 40);
    msg = `${msg} Directions: ${snippet}`;
  }
  msg = stripToGSM7(msg).slice(0, 160);
  return msg;
}

function stripToGSM7(s: string) {
  if (!s) return '';
  // remove characters outside basic printable ASCII range and common CR/LF
  return s.replace(/[^ \x20-\x7E\r\n]/g, '');
}

export async function sendSms(to: string | string[], message: string): Promise<SmsResult> {
  if (!AT_API_KEY || !AT_USERNAME) {
    return { success: false, error: "Africa's Talking credentials not configured" };
  }

  const recipients = Array.isArray(to) ? to.map(normalizeNumber).filter(Boolean).join(',') : normalizeNumber(String(to));

  const form: any = {
    username: AT_USERNAME,
    to: recipients,
    message,
  };

  if (!AT_SANDBOX && AT_FROM) form.from = AT_FROM;

  try {
    const data = await postToAT(form);
    return { success: true, data };
  } catch (err: any) {
    const msg = err.response?.data || err.message || String(err);
    return { success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
  }
}

export async function sendReleaseCodeSms(toPhone: string, shopName: string, code: string, sellerPhone: string, orderId: string): Promise<SmsResult> {
  // amount not available here; use generic builder which already conforms to spec
  const message = buildReleaseSms(shopName, code, sellerPhone, orderId);
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, message);
}

export async function sendBuyerSms(toPhone: string, amount: number | string, shopName: string, code: string, sellerPhone: string, orderId: string): Promise<SmsResult> {
  const message = buildBuyerSms(amount, shopName, code, sellerPhone, orderId);
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, message);
}

/**
 * Send buyer SMS tailored to logistics path (HOME or DEPOT)
 */
export async function sendBuyerDeliverySms(toPhone: string, options: { logisticsPath: 'HOME' | 'DEPOT', driverHintLink?: string, code: string, sellerPhone?: string, carrierName?: string, waybillNumber?: string, depotName?: string, labelText?: string }) : Promise<SmsResult> {
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };

  let msg = '';
  if (options.logisticsPath === 'HOME') {
    const linkPart = options.driverHintLink ? `View their location hint here: ${options.driverHintLink}. ` : '';
    msg = `Your driver is coming! ${linkPart}Your Release Code: ${options.code}.`;
  } else {
    // DEPOT
    const carrier = options.carrierName ? options.carrierName : 'carrier';
    const waybillPart = options.waybillNumber ? `Waybill: #${options.waybillNumber}. ` : '';
    const depotPart = options.depotName ? `Collect at ${options.depotName}. ` : '';
    const labelPart = options.labelText ? `Look for the box marked '${options.labelText}'. ` : '';
    msg = `Your gift is on the ${carrier} bus! ${waybillPart}${depotPart}${labelPart}Your Release Code: ${options.code}.`;
  }

  msg = stripToGSM7(msg).slice(0, 160);
  return await sendSms(to, msg);
}

export async function sendSellerSms(toPhone: string, orderNum: string, buyerName: string, amount: number | string, buyerPhone?: string, deliveryDirections?: string): Promise<SmsResult> {
  const message = buildSellerSms(orderNum, buyerName, amount, buyerPhone || '', deliveryDirections || '');
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, message);
}

export async function sendSellerLocationUpdateSms(toPhone: string, orderNum: string): Promise<SmsResult> {
  const shortOrder = String(orderNum || '').slice(-6);
  let msg = `SANKHA: Delivery location updated for Order #${shortOrder}. Check your seller dashboard for new map pin.`;
  msg = stripToGSM7(msg).slice(0, 160);
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, msg);
}

export async function sendRecipientSms(toPhone: string, buyerName: string, orderNum: string, link: string): Promise<SmsResult> {
  const shortOrder = String(orderNum || '').slice(-6);
  const shortLink = link ? link : '';
  let msg = `Zikomo! ${buyerName} has sent you a package via Sankha (Order #${shortOrder}). The driver will call you. View delivery status: ${shortLink}`;
  msg = stripToGSM7(msg).slice(0, 160);
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, msg);
}

/**
 * Send recipient a magic link to update delivery location.
 * Accepts an order-like object with `id`, `delivery_update_token`, and buyer name fields.
 */
export async function sendRecipientMagicLink(order: any): Promise<SmsResult> {
  const recipientPhone = order?.recipient_phone || order?.user_addresses?.[0]?.phone_number || '';
  const buyerName = order?.users ? `${order.users.first_name || ''} ${order.users.last_name || ''}`.trim() : (order?.buyer_name || 'Someone');
  if (!recipientPhone) return { success: false, error: 'No recipient phone available' };
  const token = order?.delivery_update_token;
  if (!token) return { success: false, error: 'No delivery token available' };
  const linkBase = process.env.FRONTEND_URL || '';
  const link = `${linkBase.replace(/\/$/, '')}/orders/${encodeURIComponent(order.id)}/update-delivery?token=${encodeURIComponent(token)}`;
  const msg = `Zikomo! A gift from ${buyerName} is coming. Update your delivery spot here: ${link}`;
  const safe = stripToGSM7(msg).slice(0, 160);
  const to = normalizeNumber(recipientPhone) || normalizeNumber('+' + String(recipientPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, safe);
}

export default { sendSms, sendReleaseCodeSms, buildReleaseSms, buildBuyerSms, buildSellerSms, sendBuyerSms, sendSellerSms, sendSellerLocationUpdateSms, sendRecipientSms, sendRecipientMagicLink, sendBuyerDeliverySms };
