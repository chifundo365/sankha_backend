import { RELEASE_CODE } from './constants';

/**
 * Generate a random release code for delivery verification
 * Uses charset that excludes confusing characters (I, O, 0, 1)
 */
export const generateReleaseCode = (): string => {
  const { LENGTH, CHARSET } = RELEASE_CODE;
  let code = '';
  
  for (let i = 0; i < LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CHARSET.length);
    code += CHARSET[randomIndex];
  }
  
  return code;
};

/**
 * Calculate release code expiry date
 * @param days Number of days until expiry (default from constants)
 */
export const getReleaseCodeExpiry = (days: number = RELEASE_CODE.EXPIRY_DAYS): Date => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

/**
 * Check if a release code has expired
 */
export const isReleaseCodeExpired = (expiresAt: Date | null): boolean => {
  if (!expiresAt) return true;
  return new Date() > new Date(expiresAt);
};

/**
 * Format release code for display (e.g., "X7K-9M2")
 * Optional: adds a hyphen in the middle for readability
 */
export const formatReleaseCode = (code: string): string => {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
};
