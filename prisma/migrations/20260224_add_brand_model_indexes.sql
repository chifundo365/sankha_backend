-- NOTE: Run these CREATE INDEX CONCURRENTLY statements in your Neon Console (they cannot run inside a transaction).
-- Creates a lowercase btree index for brand and a trigram expression index for model (for ILIKE queries).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand_lower ON public.products (lower(brand));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_brand_lower ON public.shop_products (lower(brand));

-- If you expect substring/ILIKE searches on model, trigram is helpful.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_model_trgm ON public.products USING gin (lower(coalesce(model, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_model_trgm ON public.shop_products USING gin (lower(coalesce(model, '')) gin_trgm_ops);
