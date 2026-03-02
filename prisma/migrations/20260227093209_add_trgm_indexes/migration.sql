-- Ensure trigram extension for GIN trigram indexes used by search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Remove CONCURRENTLY for Prisma compatibility
CREATE INDEX idx_products_normalized_name_trgm_lower ON products USING gin (lower(normalized_name) gin_trgm_ops);
CREATE INDEX idx_products_name_trgm_lower ON products USING gin (lower(name) gin_trgm_ops);
CREATE INDEX idx_products_brand_trgm_lower ON products USING gin (lower(brand) gin_trgm_ops);

CREATE INDEX idx_products_specs_storage_trgm_lower
  ON products USING gin (lower(COALESCE(specs ->> 'Storage','')) gin_trgm_ops);
