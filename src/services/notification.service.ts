import axios from 'axios';
import querystring from 'querystring';

/**
 * Notification service (SMS via Africa's Talking + email placeholder)
 *
 * This file provides a small, extendable SMS sender using Africa's Talking
 * REST API. Credentials are read from environment variables in `.env`.
 */

const AT_USERNAME = process.env.AFRICASTALKING_USERNAME || '';
const AT_API_KEY = process.env.AFRICASTALKING_API_KEY || '';
const AT_FROM = process.env.AFRICASTALKING_FROM || '';
const AT_SANDBOX = (process.env.AFRICASTALKING_SANDBOX || 'false') === 'true';

const AT_BASE = AT_SANDBOX
  ? 'https://api.sandbox.africastalking.com/version1/messaging'
  : 'https://api.africastalking.com/version1/messaging';

async function sendSms(to: string | string[], message: string) {
  if (!AT_API_KEY || !AT_USERNAME) {
    throw new Error('Africa\'s Talking credentials not configured (AFRICASTALKING_API_KEY/USERNAME)');
  }

  // Normalize recipient numbers: ensure +countrycode prefix when missing
  const rawRecipients = Array.isArray(to) ? to : String(to).split(',');
  const normalizeNumber = (n: string) => {
    const s = String(n || '').trim();
    if (!s) return '';
    if (s.startsWith('+')) return s;
    // keep only digits and prefix with +
    const digits = s.replace(/\D/g, '');
    return digits ? `+${digits}` : s;
  };

  const recipients = rawRecipients.map(normalizeNumber).filter(Boolean).join(',');

  const payload = querystring.stringify({
    username: AT_USERNAME,
    to: recipients,
    message,
    from: AT_FROM
  });

  try {
    console.log('[notification] Sending SMS', { to: recipients, sandbox: AT_SANDBOX });
    const res = await axios.post(AT_BASE, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'apiKey': AT_API_KEY
      },
      timeout: 10000
    });

    console.log('[notification] SMS send response', { to: recipients, status: res.status, data: res.data });
    return res.data;
  } catch (err: any) {
    // Bubble useful error info for caller to log/handle
    const msg = err.response?.data || err.message || String(err);
    console.error('[notification] SMS send error', { to: recipients, error: msg });
    throw new Error(`Failed to send SMS: ${JSON.stringify(msg)}`);
  }
}

/**
 * Send release code to buyer via SMS (convenience helper)
 */
export async function sendReleaseCodeSms(phone: string, code: string, expiresAt?: Date) {
  const exp = expiresAt ? `Expires: ${expiresAt.toUTCString()}` : '';
  const message = `Your Sankha release code is ${code}. ${exp} Reply only to verify delivery.`;
  console.log('[notification] Preparing release code SMS', { phone, code, expiresAt });
  const result = await sendSms(phone, message);
  console.log('[notification] Release code SMS result', { phone, result });
  return result;
}

export default { sendSms, sendReleaseCodeSms };
