import { z } from 'zod';

/**
 * Schema for requesting a withdrawal
 */
export const requestWithdrawalSchema = z.object({
  body: z.object({
    amount: z
      .number({ message: 'Amount is required' })
      .positive('Amount must be positive')
      .min(1000, 'Minimum withdrawal is MWK 1,000')
      .max(5000000, 'Maximum withdrawal is MWK 5,000,000'),
    recipient_phone: z
      .string({ message: 'Recipient phone number is required' })
      .min(10, 'Phone number must be at least 10 characters')
      .max(20, 'Phone number must not exceed 20 characters')
      .regex(/^(\+?265|0)?[89]\d{8}$/, 'Invalid Malawi phone number format'),
    recipient_name: z
      .string({ message: 'Recipient name is required' })
      .min(2, 'Recipient name must be at least 2 characters')
      .max(255, 'Recipient name must not exceed 255 characters'),
    provider: z
      .enum(['airtel_mw', 'tnm_mw'], { message: 'Provider must be airtel_mw or tnm_mw' })
      .optional(),
  }),
});

/**
 * Schema for getting withdrawal by ID
 */
export const getWithdrawalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid withdrawal ID format'),
  }),
});

/**
 * Schema for listing withdrawals
 */
export const listWithdrawalsSchema = z.object({
  query: z.object({
    status: z
      .enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'])
      .optional(),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20)),
  }),
});

/**
 * Schema for admin completing a withdrawal
 */
export const adminCompleteWithdrawalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid withdrawal ID format'),
  }),
  body: z.object({
    reference: z
      .string({ message: 'Payout reference is required' })
      .min(1, 'Reference cannot be empty'),
  }),
});

/**
 * Schema for admin failing a withdrawal
 */
export const adminFailWithdrawalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid withdrawal ID format'),
  }),
  body: z.object({
    reason: z
      .string({ message: 'Failure reason is required' })
      .min(5, 'Reason must be at least 5 characters'),
  }),
});
