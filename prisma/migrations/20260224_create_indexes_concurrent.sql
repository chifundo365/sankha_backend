-- Create GIN and trigram indexes CONCURRENTLY to avoid table locks
-- GIN indexes for JSONB columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_specs_gin
  ON public.shop_products USING gin (specs);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_variant_values_gin
  ON public.shop_products USING gin (variant_values);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_specs_gin
  ON public.products USING gin (specs);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_variant_values_gin
  ON public.products USING gin (variant_values);

-- Trigram expression indexes for common spec key `Storage` to speed ILIKE searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_specs_storage_trgm
  ON public.shop_products USING gin ( lower(coalesce(specs->>'Storage','')) gin_trgm_ops );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_specs_storage_trgm
  ON public.products USING gin ( lower(coalesce(specs->>'Storage','')) gin_trgm_ops );

-- Note: CREATE INDEX CONCURRENTLY cannot be executed inside a transaction block.
-- Run these statements one-by-one if your SQL client wraps scripts in transactions.
