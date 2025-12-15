import prisma from '../prismaClient';

/**
 * Stock Logger Utility
 * 
 * Provides helper functions for setting custom stock change reasons
 * that will be captured by the database trigger when stock is updated.
 * 
 * The PostgreSQL trigger reads the session variable 'app.stock_change_reason'
 * to provide context-aware logging.
 * 
 * Usage:
 *   await stockLogger.withReason('Order ORD-2025-000001 checkout', async () => {
 *     await prisma.shop_products.update({
 *       where: { id: productId },
 *       data: { stock_quantity: { decrement: 1 } }
 *     });
 *   });
 */

/**
 * Execute stock update with a custom reason that will be logged by the trigger
 * @param reason - The reason for the stock change
 * @param operation - The async operation that modifies stock
 */
export async function withStockReason<T>(reason: string, operation: () => Promise<T>): Promise<T> {
  // Use raw query to set session variable before the operation
  await prisma.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
  
  try {
    const result = await operation();
    return result;
  } finally {
    // Reset the session variable
    await prisma.$executeRawUnsafe(`RESET app.stock_change_reason`);
  }
}

/**
 * Execute stock update within a transaction with a custom reason
 * This ensures the session variable is properly scoped to the transaction
 * 
 * @param reason - The reason for the stock change
 * @param operation - The async operation that modifies stock (receives transaction client)
 */
export async function withStockReasonTransaction<T>(
  reason: string, 
  operation: (tx: typeof prisma) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set the session variable for this transaction
    await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
    
    // Execute the operation
    const result = await operation(tx as typeof prisma);
    
    // Note: SET LOCAL is automatically reset at end of transaction
    return result;
  });
}

/**
 * Update stock with automatic logging (uses trigger)
 * This is a convenience function that wraps common stock operations
 */
export const stockLogger = {
  /**
   * Decrease stock for an order checkout
   */
  async reserveStockForOrder(
    shopProductId: string, 
    quantity: number, 
    orderNumber: string
  ) {
    return withStockReasonTransaction(
      `Stock reserved - Order ${orderNumber}`,
      async (tx) => {
        return tx.shop_products.update({
          where: { id: shopProductId },
          data: { stock_quantity: { decrement: quantity } }
        });
      }
    );
  },

  /**
   * Restore stock when payment fails or expires
   */
  async restoreStockForFailedPayment(
    shopProductId: string, 
    quantity: number, 
    orderNumber: string,
    reason: string = 'Payment failed'
  ) {
    return withStockReasonTransaction(
      `Stock restored - ${reason} for order ${orderNumber}`,
      async (tx) => {
        return tx.shop_products.update({
          where: { id: shopProductId },
          data: { stock_quantity: { increment: quantity } }
        });
      }
    );
  },

  /**
   * Adjust stock manually (for inventory corrections)
   */
  async adjustStock(
    shopProductId: string, 
    newQuantity: number, 
    adjustedBy: string
  ) {
    return withStockReasonTransaction(
      `Manual stock adjustment by ${adjustedBy}`,
      async (tx) => {
        return tx.shop_products.update({
          where: { id: shopProductId },
          data: { stock_quantity: newQuantity }
        });
      }
    );
  },

  /**
   * Add stock (restocking)
   */
  async addStock(
    shopProductId: string, 
    quantity: number, 
    reason: string = 'Restocking'
  ) {
    return withStockReasonTransaction(
      reason,
      async (tx) => {
        return tx.shop_products.update({
          where: { id: shopProductId },
          data: { stock_quantity: { increment: quantity } }
        });
      }
    );
  },

  /**
   * Execute any stock operation with a custom reason
   */
  withReason: withStockReason,
  withReasonTransaction: withStockReasonTransaction
};

export default stockLogger;
