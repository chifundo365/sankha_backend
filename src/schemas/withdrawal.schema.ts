import { z } from 'zod';

/**
 * Schema for requesting a withdrawal (new PayChangu destination-based flow)
 */
export const requestWithdrawalSchema = z.object({
  body: z.object({
    amount: z
      .number({ message: 'Amount is required' })
      .positive('Amount must be positive')
      .min(5000, 'Minimum withdrawal is MWK 5,000')
      .max(5000000, 'Maximum withdrawal is MWK 5,000,000'),
    destination_uuid: z
      .string({ message: 'Payout destination is required' })
      .min(1, 'Please select a payout destination'),
    account_number: z
      .string({ message: 'Account number is required' })
      .min(1, 'Account number is required'),
    account_name: z
      .string({ message: 'Account name is required' })
      .min(1, 'Account name is required'),
    shop_id: z
      .string()
      .uuid('Invalid shop ID format')
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
      .enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEBT_CLEARED'])
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
