EXPLAIN ANALYZE
SELECT 1
FROM shop_products sp
LEFT JOIN products p ON p.id = sp.product_id
WHERE (
  lower(coalesce(sp.specs->>'Storage','')) LIKE lower('%256GB%')
  OR lower(coalesce(p.specs->>'Storage','')) LIKE lower('%256GB%')
)
LIMIT 100;
