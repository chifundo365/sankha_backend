-- Create trigram extension and expression trigram indexes for common spec keys
-- Use CONCURRENTLY to avoid long locks. Run one statement at a time in Neon if preferred.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on shop_products.specs->>'Storage'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_specs_storage_trgm
  ON public.shop_products USING gin ( lower(coalesce((specs->>'Storage'),'')) gin_trgm_ops );

-- Trigram index on products.specs->>'Storage'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_specs_storage_trgm
  ON public.products USING gin ( lower(coalesce((specs->>'Storage'),'')) gin_trgm_ops );

-- Note: creating trigram indexes can take time and disk space on large tables.
-- If you have many spec keys, consider denormalizing or a searchable KV table instead.
