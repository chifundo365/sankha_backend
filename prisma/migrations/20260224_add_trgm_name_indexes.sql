-- NOTE: Run these CREATE INDEX CONCURRENTLY statements in your Neon Console (they cannot run inside a transaction).
-- Adds trigram (pg_trgm) indexes for fuzzy search on product name and normalized_name.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (lower(coalesce(name, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_normalized_name_trgm ON public.products USING gin (lower(coalesce(normalized_name, '')) gin_trgm_ops);

-- Optionally add corresponding indexes on shop_products if you search their name fields there.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_name_trgm ON public.shop_products USING gin (lower(coalesce(name, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_normalized_name_trgm ON public.shop_products USING gin (lower(coalesce(normalized_name, '')) gin_trgm_ops);
