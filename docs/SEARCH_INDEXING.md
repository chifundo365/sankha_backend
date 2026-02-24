# Search indexing & fuzzy search (pg_trgm)

Run the following statements in the Neon Console (one at a time). `CREATE INDEX CONCURRENTLY` cannot run inside a transaction — run during off-peak and wait for each to finish.

-- enable pg_trgm (safe to run once)
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

-- brand btree indexes (lowercase expression)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand_lower ON public.products (lower(brand));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_brand_lower ON public.shop_products (lower(brand));
```

-- model trigram indexes (for ILIKE / substring/fuzzy on model)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_model_trgm ON public.products USING gin (lower(coalesce(model, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_model_trgm ON public.shop_products USING gin (lower(coalesce(model, '')) gin_trgm_ops);
```

-- trigram indexes for name/normalized_name (recommended)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (lower(coalesce(name, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_normalized_name_trgm ON public.products USING gin (lower(coalesce(normalized_name, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_name_trgm ON public.shop_products USING gin (lower(coalesce(name, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_products_normalized_name_trgm ON public.shop_products USING gin (lower(coalesce(normalized_name, '')) gin_trgm_ops);
```

Verification
- list created indexes:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'products' ORDER BY indexname;
SELECT indexname FROM pg_indexes WHERE tablename = 'shop_products' ORDER BY indexname;
```

- sanity-check planner usage for a sample term (replace `'15 Pro'`):
```sql
EXPLAIN ANALYZE
SELECT 1 FROM products p
WHERE lower(coalesce(p.name,'')) LIKE lower('%15 Pro%')
  OR lower(coalesce(p.name,'')) % lower('15 Pro')
  OR similarity(lower(coalesce(p.name,'')), lower('15 Pro')) > 0.30
LIMIT 10;
```

Configuration & tuning
- The server reads `SEARCH_SIMILARITY` (default 0.28) to control similarity threshold. Set it in your production environment to tune recall vs precision (suggested range 0.25–0.40).
- Create indexes using `CONCURRENTLY` during an off-peak window. Each statement should be executed separately and waited on until it completes.

Notes
- Trigram indexes increase disk usage and index maintenance overhead on writes. Monitor write latency during index creation.
- We keep LIKE checks as primary matches and use trigram/similarity as a fallback/boost; specs JSONB matching remains ILIKE/exact-style.

If you want, I can prepare a small PR with these docs and the migration files included.
