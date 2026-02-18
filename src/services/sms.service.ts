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

export function buildSellerSms(orderNum: string, buyerName: string, amount: number | string, buyerPhone: string): string {
  const amt = Number(amount || 0).toLocaleString();
  let msg = `SANKHA: Order #${orderNum} arriving for ${buyerName}. Once they inspect, ask for the Release Code to get your MK${amt}. Call Buyer: ${buyerPhone}`;
  msg = stripToGSM7(msg);
  return msg.length <= 160 ? msg : msg.slice(0, 160);
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

export async function sendSellerSms(toPhone: string, orderNum: string, buyerName: string, amount: number | string): Promise<SmsResult> {
  const message = buildSellerSms(orderNum, buyerName, amount, toPhone);
  const to = normalizeNumber(toPhone) || normalizeNumber('+' + String(toPhone).replace(/\D/g, ''));
  if (!to) return { success: false, error: 'Invalid recipient phone' };
  return await sendSms(to, message);
}

export default { sendSms, sendReleaseCodeSms, buildReleaseSms, buildBuyerSms, buildSellerSms, sendBuyerSms, sendSellerSms };
