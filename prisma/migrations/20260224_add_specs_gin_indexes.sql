-- Migration: add GIN indexes to speed JSONB specs/variant_values searches
BEGIN;

-- Indexes on shop_products
CREATE INDEX IF NOT EXISTS idx_shop_products_specs_gin ON shop_products USING gin (specs);
CREATE INDEX IF NOT EXISTS idx_shop_products_variant_values_gin ON shop_products USING gin (variant_values);

-- Indexes on products (product-level specs/variant_values)
CREATE INDEX IF NOT EXISTS idx_products_specs_gin ON products USING gin (specs);
CREATE INDEX IF NOT EXISTS idx_products_variant_values_gin ON products USING gin (variant_values);

COMMIT;

-- Notes:
-- These indexes use the default jsonb GIN operator class. For large-scale text ILIKE searches
-- you may want to add trigram indexes on extracted text or denormalize into a text search
-- column that can be indexed with GIN-TSVECTOR or trigram GIN for faster ILIKE.
