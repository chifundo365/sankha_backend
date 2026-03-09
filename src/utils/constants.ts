/**
 * Sankha Platform Constants
 * Single source of truth for business logic values
 */

// ============ PRICING ============

/**
 * Inverse-margin pricing formula (Sankha Financial Blueprint v2)
 * 
 * Formula: ceil((vendorPrice + FLAT_FEE) / (1 − COMBINED_MARGIN) / ROUNDING_STEP) × ROUNDING_STEP
 * 
 * - FLAT_FEE: MWK 720 (covers SMS + internal ops)
 * - COMBINED_MARGIN: 7.7% (PayChangu 3% + PayChangu payout 1.7% + Sankha 3%)
 * - ROUNDING_STEP: MWK 500 (consumer-friendly rounding)
 */
export const PRICING = {
  FLAT_FEE: 720,
  COMBINED_MARGIN_PERCENT: 7.7,
  ROUNDING_STEP: 500,
} as const;

/**
 * Calculate display price from vendor's base price using inverse margin formula.
 * @param vendorPrice - The seller's base price (MWK)
 * @returns Consumer-facing price rounded up to nearest ROUNDING_STEP
 */
export const calculateDisplayPrice = (vendorPrice: number): number => {
  const { FLAT_FEE, COMBINED_MARGIN_PERCENT, ROUNDING_STEP } = PRICING;
  const raw = (vendorPrice + FLAT_FEE) / (1 - COMBINED_MARGIN_PERCENT / 100);
  return Math.ceil(raw / ROUNDING_STEP) * ROUNDING_STEP;
};

/**
 * Fee breakdown percentages (for display/documentation)
 */
export const FEES = {
  PAYCHANGU_PERCENTAGE: 3,
  PAYCHANGU_PAYOUT_PERCENTAGE: 1.7,
  SANKHA_PERCENTAGE: 3,
  FLAT_FEE_MWK: 720,
  TOTAL_MARGIN_PERCENTAGE: 7.7,
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
