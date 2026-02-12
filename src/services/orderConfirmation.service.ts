import prisma from '../prismaClient';
import { sendReleaseCodeSms } from './notification.service';

/**
 * Order Confirmation / Release Code Service
 *
 * Responsibilities:
 * - Generate a short release code and persist it on the order
 * - Verify a provided release code (mark order code as verified)
 * - Credit the shop wallet and create a transaction record when verified
 *
 * This implementation is intentionally small and well-documented so it can
 * be extended later (fees, payouts, webhooks, notifications).
 */

const CODE_LENGTH = 6;
const EXPIRY_DAYS = Number(process.env.RELEASE_CODE_EXPIRY_DAYS) || 14;

function generateRandomCode(length = CODE_LENGTH) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // omit ambiguous chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const orderConfirmationService = {
  /**
   * Generate and persist a release code for an order.
   * Returns { success, code, expiresAt } on success, or { success:false, error }
   */
  async generateReleaseCode(orderId: string) {
    const order = await prisma.orders.findUnique({ where: { id: orderId } });

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    const code = generateRandomCode();
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.orders.update({
      where: { id: orderId },
      data: {
        release_code: code,
        release_code_status: 'PENDING',
        release_code_expires_at: expiresAt,
        release_code_verified_at: null
      }
    });

    return { success: true, code, expiresAt };
  },

  /**
   * Verify a release code. If valid, mark verified and credit the shop wallet.
   * Returns an object describing the result and updated balances.
   */
  async verifyReleaseCode(orderId: string, code: string, shopId?: string) {
    // Load order, items and shop wallet
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: true,
        shops: true
      }
    });

    if (!order) return { success: false, error: 'Order not found' };

    if (!order.release_code) return { success: false, errorCode: 'NO_CODE', error: 'No release code generated' };

    if (order.release_code_status === 'VERIFIED') {
      return { success: false, errorCode: 'ALREADY_VERIFIED', error: 'Release code already verified' };
    }

    if (shopId && order.shop_id !== shopId) {
      return { success: false, errorCode: 'WRONG_SHOP', error: 'This order does not belong to the provided shop' };
    }

    if (String(code).trim().toUpperCase() !== String(order.release_code).trim().toUpperCase()) {
      return { success: false, errorCode: 'INVALID_CODE', error: 'Invalid release code' };
    }

    if (order.release_code_expires_at && new Date() > order.release_code_expires_at) {
      return { success: false, errorCode: 'EXPIRED', error: 'Release code has expired' };
    }

    // Compute seller payout: prefer base_price when available, fall back to unit_price
    let sellerPayout = 0;
    for (const item of order.order_items) {
      const unit = (item as any).base_price ?? (item as any).unit_price ?? 0;
      sellerPayout += Number(unit) * Number((item as any).quantity || 0);
    }

    // Default to order.total_amount if calculation yields zero
    if (!sellerPayout || sellerPayout === 0) {
      sellerPayout = Number(order.total_amount || 0);
    }

    // Update shop wallet and create transaction atomically
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shops.findUnique({ where: { id: order.shop_id } });
      if (!shop) throw new Error('Shop not found');

      const balanceBefore = Number(shop.wallet_balance || 0);
      const balanceAfter = Number((balanceBefore || 0) + sellerPayout);

      // Update shop balance
      await tx.shops.update({
        where: { id: shop.id },
        data: { wallet_balance: balanceAfter }
      });

      // Create transaction ledger entry
      await tx.transactions.create({
        data: {
          shop_id: shop.id,
          type: 'ORDER_CREDIT',
          amount: sellerPayout,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          status: 'COMPLETED',
          order_id: order.id,
          description: `Order ${order.order_number} - release code verified`,
          created_at: now
        }
      });

      // Mark release code verified on order
      const updatedOrder = await tx.orders.update({
        where: { id: order.id },
        data: {
          release_code_status: 'VERIFIED',
          release_code_verified_at: now
        }
      });

      return { shop, updatedOrder, balanceBefore, balanceAfter };
    });

    return {
      success: true,
      sellerPayout,
      newWalletBalance: result.balanceAfter,
      order: result.updatedOrder
    };
  }
};

export default orderConfirmationService;
import prisma from '../prismaClient';
import { Decimal } from '../../generated/prisma/runtime/library';
import { generateReleaseCode, getReleaseCodeExpiry, isReleaseCodeExpired } from '../utils/releaseCode';

/**
 * Result types for release code operations
 */
interface ReleaseCodeGenerationResult {
  success: boolean;
  code?: string;
  expiresAt?: Date;
  error?: string;
}

interface ReleaseCodeVerificationResult {
  success: boolean;
  order?: any;
  sellerPayout?: Decimal;
  newWalletBalance?: Decimal;
  error?: string;
  errorCode?: 'INVALID_CODE' | 'EXPIRED' | 'ALREADY_VERIFIED' | 'WRONG_SHOP' | 'INVALID_ORDER' | 'ORDER_NOT_CONFIRMED';
}

/**
 * OrderConfirmationService
 * Handles release code generation, verification, and wallet crediting
 */
class OrderConfirmationService {
  
  /**
   * Generate a release code for an order after payment is confirmed
   * Called when order status changes to CONFIRMED
   */
  async generateReleaseCode(orderId: string): Promise<ReleaseCodeGenerationResult> {
    try {
      const order = await prisma.orders.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          release_code: true,
          release_code_status: true,
        }
      });

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      // Only generate for CONFIRMED orders
      if (order.status !== 'CONFIRMED') {
        return { success: false, error: `Cannot generate release code for order with status: ${order.status}` };
      }

      // Don't regenerate if already exists and not expired/cancelled
      if (order.release_code && order.release_code_status === 'PENDING') {
        return { 
          success: true, 
          code: order.release_code,
          expiresAt: undefined // Would need to fetch from DB
        };
      }

      // Generate new code
      const code = generateReleaseCode();
      const expiresAt = getReleaseCodeExpiry();

      // Ensure uniqueness (rare collision)
      const existingWithCode = await prisma.orders.findFirst({
        where: { 
          release_code: code,
          release_code_status: 'PENDING'
        }
      });

      if (existingWithCode) {
        // Recursive retry on collision (very rare)
        return this.generateReleaseCode(orderId);
      }

      // Update order with release code
      const updated = await prisma.orders.update({
        where: { id: orderId },
        data: {
          release_code: code,
          release_code_status: 'PENDING',
          release_code_expires_at: expiresAt,
          updated_at: new Date(),
        },
        include: {
          users: {
            select: {
              phone_number: true,
              email: true
            }
          }
        }
      });

      // Send release code SMS in background (sandbox-safe). Don't fail generation if SMS fails.
      (async () => {
        try {
          const phone = updated.users?.phone_number;
          if (phone) {
            await sendReleaseCodeSms(phone, code, expiresAt);
          }
        } catch (err) {
          console.error('Failed to send release code SMS (sandbox):', err);
        }
      })();

      return {
        success: true,
        code,
        expiresAt,
      };
    } catch (error) {
      console.error('Generate release code error:', error);
      return { success: false, error: 'Failed to generate release code' };
    }
  }

  /**
   * Verify a release code entered by the shop
   * Credits the shop wallet on successful verification
   */
  async verifyReleaseCode(
    orderId: string, 
    code: string, 
    shopId: string
  ): Promise<ReleaseCodeVerificationResult> {
    try {
      // Fetch order with items for payout calculation
      const order = await prisma.orders.findUnique({
        where: { id: orderId },
        include: {
          order_items: true,
          shops: {
            select: {
              id: true,
              wallet_balance: true,
            }
          }
        }
      });

      if (!order) {
        return { success: false, error: 'Order not found', errorCode: 'INVALID_ORDER' };
      }

      // Verify shop ownership
      if (order.shop_id !== shopId) {
        return { success: false, error: 'This order does not belong to your shop', errorCode: 'WRONG_SHOP' };
      }

      // Check order status
      if (order.status !== 'CONFIRMED' && order.status !== 'OUT_FOR_DELIVERY') {
        return { 
          success: false, 
          error: `Order must be CONFIRMED or OUT_FOR_DELIVERY to verify. Current status: ${order.status}`,
          errorCode: 'ORDER_NOT_CONFIRMED'
        };
      }

      // Check if already verified
      if (order.release_code_status === 'VERIFIED') {
        return { success: false, error: 'This order has already been verified', errorCode: 'ALREADY_VERIFIED' };
      }

      // Check expiration
      if (isReleaseCodeExpired(order.release_code_expires_at)) {
        return { success: false, error: 'Release code has expired', errorCode: 'EXPIRED' };
      }

      // Verify the code (case-insensitive)
      if (!order.release_code || order.release_code.toUpperCase() !== code.toUpperCase()) {
        return { success: false, error: 'Invalid release code', errorCode: 'INVALID_CODE' };
      }

      // Calculate seller payout from frozen base_prices
      const sellerPayout = this.calculateSellerPayout(order.order_items);
      
      // Get current wallet balance
      const balanceBefore = order.shops?.wallet_balance || new Decimal(0);
      const balanceAfter = new Decimal(balanceBefore).add(sellerPayout);

      // Use batch transaction (faster on Neon serverless)
      const [updatedShop, transaction, updatedOrder] = await prisma.$transaction([
        // Update shop wallet
        prisma.shops.update({
          where: { id: shopId },
          data: {
            wallet_balance: balanceAfter,
            updated_at: new Date(),
          }
        }),
        // Create transaction record
        prisma.transactions.create({
          data: {
            shop_id: shopId,
            type: 'ORDER_CREDIT',
            amount: sellerPayout,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            status: 'COMPLETED',
            order_id: orderId,
            description: `Payment for order #${order.order_number}`,
          }
        }),
        // Update order status
        prisma.orders.update({
          where: { id: orderId },
          data: {
            status: 'DELIVERED',
            release_code_status: 'VERIFIED',
            release_code_verified_at: new Date(),
            updated_at: new Date(),
          },
          include: {
            order_items: true,
          }
        })
      ]);

      return {
        success: true,
        order: updatedOrder,
        sellerPayout,
        newWalletBalance: balanceAfter,
      };
    } catch (error) {
      console.error('Verify release code error:', error);
      return { success: false, error: 'Failed to verify release code' };
    }
  }

  /**
   * Calculate seller payout from order items
   * Uses frozen base_price × quantity for each item
   */
  private calculateSellerPayout(orderItems: { base_price: Decimal | null; quantity: number }[]): Decimal {
    return orderItems.reduce((sum, item) => {
      const basePrice = item.base_price ? new Decimal(item.base_price) : new Decimal(0);
      return sum.add(basePrice.mul(item.quantity));
    }, new Decimal(0));
  }

  /**
   * Mark expired release codes as EXPIRED
   * Called by background job
   */
  async processExpiredReleaseCodes(): Promise<number> {
    try {
      const result = await prisma.orders.updateMany({
        where: {
          release_code_status: 'PENDING',
          release_code_expires_at: {
            lt: new Date()
          }
        },
        data: {
          release_code_status: 'EXPIRED',
          updated_at: new Date(),
        }
      });

      return result.count;
    } catch (error) {
      console.error('Process expired release codes error:', error);
      return 0;
    }
  }

  /**
   * Get release code status for an order (for buyer to check)
   */
  async getReleaseCodeStatus(orderId: string, buyerId: string) {
    const order = await prisma.orders.findFirst({
      where: { 
        id: orderId,
        buyer_id: buyerId 
      },
      select: {
        release_code: true,
        release_code_status: true,
        release_code_expires_at: true,
        status: true,
      }
    });

    if (!order) return null;

    return {
      code: order.release_code,
      status: order.release_code_status,
      expiresAt: order.release_code_expires_at,
      orderStatus: order.status,
      isExpired: isReleaseCodeExpired(order.release_code_expires_at),
    };
  }
}

export const orderConfirmationService = new OrderConfirmationService();
