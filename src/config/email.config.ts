/**
 * Email Configuration (Resend)
 * 
 * Resend is used for transactional emails:
 * - Password reset
 * - Order confirmations
 * - Welcome emails
 * - Notifications
 */

export const emailConfig = {
  // Resend API key
  apiKey: process.env.RESEND_API_KEY || '',
  
  // Default sender
  from: {
    name: process.env.EMAIL_FROM_NAME || 'Sankha',
    email: process.env.EMAIL_FROM_ADDRESS || 'noreply@sankha.mw',
  },
  
  // App details for templates
  app: {
    name: 'Sankha',
    tagline: 'Malawi\'s Trusted Marketplace',
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@sankha.mw',
    logoUrl: process.env.APP_LOGO_URL || 'https://sankha.mw/logo.png',
  },
  
  // Social links for email footer
  social: {
    facebook: process.env.SOCIAL_FACEBOOK || 'https://facebook.com/sankhamw',
    twitter: process.env.SOCIAL_TWITTER || 'https://twitter.com/sankhamw',
    instagram: process.env.SOCIAL_INSTAGRAM || 'https://instagram.com/sankhamw',
  },
  
  // Rate limiting
  rateLimit: {
    maxPerMinute: 10,
    maxPerHour: 100,
  },
};

/**
 * Check if email service is configured
 */
export const isEmailConfigured = (): boolean => {
  return !!emailConfig.apiKey && emailConfig.apiKey !== '';
};

/**
 * Get formatted sender string
 */
export const getFromAddress = (): string => {
  return `${emailConfig.from.name} <${emailConfig.from.email}>`;
};
