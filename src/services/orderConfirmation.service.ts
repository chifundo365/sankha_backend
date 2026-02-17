import prisma from '../prismaClient';
import { Decimal } from '../../generated/prisma/runtime/library';
import { generateReleaseCode, getReleaseCodeExpiry, isReleaseCodeExpired } from '../utils/releaseCode';
import { sendReleaseCodeSms } from './notification.service';
import { emailService } from './email.service';

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
              email: true,
              first_name: true,
              last_name: true,
            }
          },
          shops: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          },
          order_items: true,
        }
      });

      // Send release code SMS in background (sandbox-safe). Don't fail generation if SMS fails.
      (async () => {
        try {
          const phone = updated.users?.phone_number;
          console.log('[orderConfirmation] buyer phone for SMS:', updated.users?.phone_number);
          if (phone) {
            console.log('[orderConfirmation] triggering sendReleaseCodeSms', { phone, code });
            await sendReleaseCodeSms(phone, code, expiresAt);
            console.log('[orderConfirmation] sendReleaseCodeSms completed');
          } else {
            console.log('[orderConfirmation] no buyer phone found; SMS not sent');
          }
        } catch (err) {
          console.error('Failed to send release code SMS (sandbox):', err);
        }
      })();

      // Send release code email (non-blocking). Only attempt if Resend configured.
      (async () => {
        try {
          const email = updated.users?.email;
          if (email) {
            const userName = `${updated.users?.first_name || ''} ${updated.users?.last_name || ''}`.trim() || 'Customer';
            // Prepare item list and amounts for the release code email
            const items = (updated.order_items || []).map((it: any) => ({
              name: it.product_name,
              quantity: it.quantity,
              price: Number(it.base_price ?? it.unit_price ?? 0),
            }));

            const subtotal = items.reduce((s: number, it: any) => s + (it.price * it.quantity), 0);
            const deliveryFee = Number((updated as any).delivery_fee ?? 0);
            const total = Number((updated as any).total_amount ?? subtotal + deliveryFee);

            await emailService.sendReleaseCode(email, {
              userName,
              orderNumber: (updated as any).order_number || orderId,
              releaseCode: code,
              shopName: updated.shops?.name || '',
              items,
              subtotal,
              deliveryFee,
              total,
            });
          }
        } catch (err) {
          console.error('Failed to send release code email (sandbox):', err);
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

      // Notify seller by email if shop email available (non-blocking)
      (async () => {
        try {
          const shopEmail = (updatedShop as any)?.email;
          if (shopEmail) {
            await emailService.sendWalletCredited(shopEmail, {
              userName: (updatedShop as any).name || 'Seller',
              orderNumber: (updatedOrder as any).order_number || orderId,
              amount: sellerPayout as any,
              newBalance: (updatedShop as any).wallet_balance || 0,
            });
          }
        } catch (err) {
          console.error('Failed to send wallet credited email (sandbox):', err);
        }
      })();

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
