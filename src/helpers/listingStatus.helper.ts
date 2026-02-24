import prisma from '../prismaClient';
import { listing_status } from '../../generated/prisma';

/**
 * Updates listing_status for a shop_product.
 * This is the ONLY approved way to change listing_status in the codebase.
 * Never write to listing_status directly in service files.
 *
 * listing_status = 'LIVE' + stock_quantity > 0 is the sole definition of availability.
 * is_available has been removed from the schema.
 */
export async function setListingStatus(
  shopProductId: string,
  status: listing_status,
  options?: { rejectionReason?: string; tx?: any }
): Promise<void> {
  const db = options?.tx ?? prisma;
  await db.shop_products.update({
    where: { id: shopProductId },
    data: {
      listing_status: status,
      rejection_reason: status === 'REJECTED' ? (options?.rejectionReason ?? null) : null,
      updated_at: new Date()
    }
  });
}

/**
 * Utility: check if a shop_product is currently available for purchase.
 * Use this in application logic — do NOT use listing_status directly for availability checks.
 */
export function isListingAvailable(listing: { listing_status: string | null; stock_quantity: number }): boolean {
  return listing.listing_status === 'LIVE' && listing.stock_quantity > 0;
}
