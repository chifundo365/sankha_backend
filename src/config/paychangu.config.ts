/**
 * PayChangu Payment Gateway Configuration
 */

export const paychanguConfig = {
  apiBase: process.env.PAYCHANGU_API_BASE || 'https://api.paychangu.com',
  secretKey: process.env.PAYCHANGU_SECRET_KEY || '',
  webhookSecretKey: process.env.PAYCHANGU_WEBHOOK_SECRET_KEY || '',
  callbackUrl: process.env.PAYCHANGU_CALLBACK_URL || 'http://localhost:3000/api/payments/paychangu/callback',
  returnUrl: process.env.PAYCHANGU_RETURN_URL || 'http://localhost:3000/payment/complete',
  defaultCurrency: process.env.PAYCHANGU_DEFAULT_CURRENCY || 'MWK',
  paymentExpiryMinutes: parseInt(process.env.PAYCHANGU_PAYMENT_EXPIRY_MINUTES || '59', 10),
};

export const validatePaychanguConfig = (): boolean => {
  const requiredFields = ['secretKey', 'webhookSecretKey'];
  const missingFields = requiredFields.filter(
    field => !paychanguConfig[field as keyof typeof paychanguConfig]
  );

  if (missingFields.length > 0) {
    console.warn(`⚠️  PayChangu config missing: ${missingFields.join(', ')}`);
    return false;
  }

  console.log('✅ PayChangu configuration loaded');
  return true;
};
