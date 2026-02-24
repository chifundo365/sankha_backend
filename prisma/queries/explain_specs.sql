EXPLAIN ANALYZE
SELECT 1
FROM shop_products sp
LEFT JOIN products p ON p.id = sp.product_id
WHERE (
  EXISTS (
    SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.specs)='object' THEN sp.specs ELSE '{}'::jsonb END) e
    WHERE lower(e.key)=lower('Storage') AND lower(e.value) LIKE lower('%256GB%')
  )
  OR EXISTS (
    SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.specs)='object' THEN p.specs ELSE '{}'::jsonb END) e
    WHERE lower(e.key)=lower('Storage') AND lower(e.value) LIKE lower('%256GB%')
  )
) LIMIT 100;
