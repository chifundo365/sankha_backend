-- Migration: remove is_available from shop_products
-- Reason: is_available is redundant with listing_status = 'LIVE' AND stock_quantity > 0.
-- Availability is now derived at query time. See: listing_status enum.

ALTER TABLE IF EXISTS shop_products
  DROP COLUMN IF EXISTS is_available;
