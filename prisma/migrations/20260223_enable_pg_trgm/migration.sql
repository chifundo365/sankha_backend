-- Migration: Enable pg_trgm extension and add trigram GIN index for product name

-- Enable pg_trgm (requires superuser privileges on some managed DBs)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a trigram GIN index on products.normalized_name to accelerate similarity() queries
-- (safe to run if the column already exists)
CREATE INDEX IF NOT EXISTS idx_products_normalized_name_trgm ON products USING gin (normalized_name gin_trgm_ops);
