-- Check presence of specs and variant_values columns on shop_products and products
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('shop_products','products')
  AND column_name IN ('specs','variant_values');

-- Also list indexes on these tables
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('shop_products','products');
