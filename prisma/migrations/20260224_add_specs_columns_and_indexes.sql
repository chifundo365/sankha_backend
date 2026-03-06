-- Ensure specs/variant_values columns exist, then create GIN indexes
BEGIN;

ALTER TABLE IF EXISTS shop_products ADD COLUMN IF NOT EXISTS specs jsonb;
ALTER TABLE IF EXISTS shop_products ADD COLUMN IF NOT EXISTS variant_values jsonb;

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS specs jsonb;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS variant_values jsonb;

CREATE INDEX IF NOT EXISTS idx_shop_products_specs_gin ON shop_products USING gin (specs);
CREATE INDEX IF NOT EXISTS idx_shop_products_variant_values_gin ON shop_products USING gin (variant_values);

CREATE INDEX IF NOT EXISTS idx_products_specs_gin ON products USING gin (specs);
CREATE INDEX IF NOT EXISTS idx_products_variant_values_gin ON products USING gin (variant_values);

COMMIT;
