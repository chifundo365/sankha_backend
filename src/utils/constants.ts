/**
 * Sankha Platform Constants
 * Single source of truth for business logic values
 */

// ============ PRICING ============

/**
 * Price markup multiplier for calculating display price from base price
 * - PayChangu fee: 3%
 * - Sankha commission: 2%
 * - Total markup: 5.26% (calculated as 1 / (1 - 0.05) ≈ 1.0526)
 */
export const PRICE_MARKUP_MULTIPLIER = 1.0526;

/**
 * Calculate display price from base price (applies markup)
 * @param basePrice - The seller's base price
 * @returns Display price with markup applied
 */
export const calculateDisplayPrice = (basePrice: number): number => {
  return Math.round(basePrice * PRICE_MARKUP_MULTIPLIER);
};

/**
 * Fee breakdown percentages (for display/documentation)
 */
export const FEES = {
  PAYCHANGU_PERCENTAGE: 3,
  SANKHA_PERCENTAGE: 2,
  TOTAL_PERCENTAGE: 5.26,
} as const;

// ============ RELEASE CODES ============

/**
 * Release code configuration
 */
export const RELEASE_CODE = {
  LENGTH: 6,
  EXPIRY_DAYS: 14,
  CHARSET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // Excluded: I, O, 0, 1 (avoid confusion)
} as const;

// ============ PAGINATION ============

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

// ============ WALLET ============

export const WALLET = {
  MIN_PAYOUT_AMOUNT: 1000, // MWK 1,000 minimum withdrawal
} as const;
