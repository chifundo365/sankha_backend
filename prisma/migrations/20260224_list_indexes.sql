-- List pg_indexes for shop_products and products
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('shop_products','products')
ORDER BY tablename, indexname;
