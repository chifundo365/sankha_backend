const fs = require('fs');

const filePath = 'src/controllers/search.controller.ts';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add out_of_stock_shops to ProductResult type
code = code.replace(
`type ProductResult = {
  product: any;
  market_stats: any;
  shops: ShopEntry[];
};`,
`type ProductResult = {
  product: any;
  market_stats: any;
  shops: ShopEntry[];
  out_of_stock_shops: ShopEntry[];
};`
);

// 2. Remove stock_quantity > 0 filter from active_listings and add is_out_of_stock
code = code.replace(
`    COALESCE(r.review_count, 0) AS review_count
  FROM shop_products sp
  JOIN shops s ON s.id = sp.shop_id
  LEFT JOIN products p ON p.id = sp.product_id
  LEFT JOIN (
    SELECT shop_product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
    FROM reviews
    GROUP BY shop_product_id
  ) r ON r.shop_product_id = sp.id
  WHERE sp.listing_status = 'LIVE'
    AND sp.stock_quantity > 0
    AND (\${condition}::text IS NULL OR sp.condition::text = \${condition}::text)`,
`    COALESCE(r.review_count, 0) AS review_count,
    (sp.stock_quantity <= 0) AS is_out_of_stock
  FROM shop_products sp
  JOIN shops s ON s.id = sp.shop_id
  LEFT JOIN products p ON p.id = sp.product_id
  LEFT JOIN (
    SELECT shop_product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
    FROM reviews
    GROUP BY shop_product_id
  ) r ON r.shop_product_id = sp.id
  WHERE sp.listing_status = 'LIVE'
    AND (\${condition}::text IS NULL OR sp.condition::text = \${condition}::text)`
);

// 3. Update aggregated CTE to build both lists
code = code.replace(
`aggregated AS (
  SELECT
    cp.id AS canonical_product_id,
    MIN(al.price) AS min_price,
    MAX(al.price) AS max_price,
    ROUND(AVG(al.price)::numeric, 2) AS avg_price,
    cp.match_score,
    COUNT(DISTINCT al.shop_id) AS total_active_shops,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT al.condition) FILTER (WHERE al.condition IS NOT NULL), NULL) AS conditions_available,
    COUNT(*) AS total_shops,
    (
      SELECT JSON_AGG(shop_row)
      FROM (
        SELECT
          JSON_BUILD_OBJECT(
            'shop_product_id', al2.id,
            'shop_id', al2.shop_id,
            'shop_name', al2.shop_name,
            'shop_logo', NULLIF(al2.shop_logo, ''),
            'distance_km', CASE WHEN al2.distance_km IS NULL THEN NULL ELSE ROUND(al2.distance_km::numeric, 3) END,
            'price', al2.price,
            'currency', 'MWK',
            'condition', al2.condition,
            'stock_quantity', al2.stock_quantity,
            'is_free_delivery', al2.is_free_delivery,
            'delivery_zones', al2.delivery_zones,
            'listing_status', al2.listing_status,
            'variant_values', al2.variant_values,
            'avg_rating', CASE WHEN al2.avg_rating IS NOT NULL THEN ROUND(al2.avg_rating::numeric, 2) ELSE NULL END,
            'review_count', al2.review_count
          ) AS shop_row
        FROM linked_listings al2
        WHERE al2.canonical_product_id = cp.id
        ORDER BY (CASE WHEN al2.distance_km IS NULL THEN 1 ELSE 0 END), al2.distance_km ASC NULLS LAST, al2.price ASC
        LIMIT 20
      ) limited_shops
    ) AS shops
  FROM canonical_products cp
  JOIN linked_listings al ON al.canonical_product_id = cp.id
  GROUP BY cp.id, cp.match_score
),`,
`aggregated AS (
  SELECT
    cp.id AS canonical_product_id,
    MIN(CASE WHEN NOT al.is_out_of_stock THEN al.price ELSE NULL END) AS min_price,
    MAX(CASE WHEN NOT al.is_out_of_stock THEN al.price ELSE NULL END) AS max_price,
    ROUND(AVG(CASE WHEN NOT al.is_out_of_stock THEN al.price ELSE NULL END)::numeric, 2) AS avg_price,
    cp.match_score,
    COUNT(DISTINCT CASE WHEN NOT al.is_out_of_stock THEN al.shop_id ELSE NULL END) AS total_active_shops,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT al.condition) FILTER (WHERE al.condition IS NOT NULL), NULL) AS conditions_available,
    COUNT(al.id) AS total_shops,
    (
      SELECT JSON_AGG(shop_row)
      FROM (
        SELECT
          JSON_BUILD_OBJECT(
            'shop_product_id', al2.id,
            'shop_id', al2.shop_id,
            'shop_name', al2.shop_name,
            'shop_logo', NULLIF(al2.shop_logo, ''),
            'distance_km', CASE WHEN al2.distance_km IS NULL THEN NULL ELSE ROUND(al2.distance_km::numeric, 3) END,
            'price', al2.price,
            'currency', 'MWK',
            'condition', al2.condition,
            'stock_quantity', al2.stock_quantity,
            'is_free_delivery', al2.is_free_delivery,
            'delivery_zones', al2.delivery_zones,
            'listing_status', al2.listing_status,
            'variant_values', al2.variant_values,
            'avg_rating', CASE WHEN al2.avg_rating IS NOT NULL THEN ROUND(al2.avg_rating::numeric, 2) ELSE NULL END,
            'review_count', al2.review_count
          ) AS shop_row
        FROM linked_listings al2
        WHERE al2.canonical_product_id = cp.id AND NOT al2.is_out_of_stock
        ORDER BY (CASE WHEN al2.distance_km IS NULL THEN 1 ELSE 0 END), al2.distance_km ASC NULLS LAST, al2.price ASC
        LIMIT 20
      ) limited_shops
    ) AS shops,
    (
      SELECT JSON_AGG(shop_row)
      FROM (
        SELECT
          JSON_BUILD_OBJECT(
            'shop_product_id', al2.id,
            'shop_id', al2.shop_id,
            'shop_name', al2.shop_name,
            'shop_logo', NULLIF(al2.shop_logo, ''),
            'distance_km', CASE WHEN al2.distance_km IS NULL THEN NULL ELSE ROUND(al2.distance_km::numeric, 3) END,
            'price', al2.price,
            'currency', 'MWK',
            'condition', al2.condition,
            'stock_quantity', al2.stock_quantity,
            'is_free_delivery', al2.is_free_delivery,
            'delivery_zones', al2.delivery_zones,
            'listing_status', al2.listing_status,
            'variant_values', al2.variant_values,
            'avg_rating', CASE WHEN al2.avg_rating IS NOT NULL THEN ROUND(al2.avg_rating::numeric, 2) ELSE NULL END,
            'review_count', al2.review_count
          ) AS shop_row
        FROM linked_listings al2
        WHERE al2.canonical_product_id = cp.id AND al2.is_out_of_stock
        ORDER BY (CASE WHEN al2.distance_km IS NULL THEN 1 ELSE 0 END), al2.distance_km ASC NULLS LAST, al2.price ASC
        LIMIT 10
      ) out_of_stock_shops
    ) AS out_of_stock_shops
  FROM canonical_products cp
  JOIN linked_listings al ON al.canonical_product_id = cp.id
  GROUP BY cp.id, cp.match_score
),`
);

// 4. Update the pricing range to exclude out_of_stock
code = code.replace(
`    'price_range', (
      SELECT json_build_object('min', MIN(al.price), 'max', MAX(al.price), 'currency', 'MWK')
      FROM linked_listings al
      WHERE al.canonical_product_id IN (SELECT id FROM canonical_products)
    )`,
`    'price_range', (
      SELECT json_build_object('min', MIN(al.price), 'max', MAX(al.price), 'currency', 'MWK')
      FROM linked_listings al
      WHERE al.canonical_product_id IN (SELECT id FROM canonical_products) AND NOT al.is_out_of_stock
    )`
);

// 5. Update main SELECT to include out_of_stock_shops
code = code.replace(
`  cp.id AS product_id,
  cp.name, cp.brand, cp.normalized_name, cp.model, cp.category_id, cp.images, cp.gtin, cp.mpn,
  agg.min_price, agg.max_price, agg.avg_price, agg.total_active_shops, agg.conditions_available, agg.total_shops, agg.shops, agg.match_score,
  facets_cte.facets,`,
`  cp.id AS product_id,
  cp.name, cp.brand, cp.normalized_name, cp.model, cp.category_id, cp.images, cp.gtin, cp.mpn,
  agg.min_price, agg.max_price, agg.avg_price, agg.total_active_shops, agg.conditions_available, agg.total_shops, agg.shops, agg.out_of_stock_shops, agg.match_score,
  facets_cte.facets,`
);

// 6. Update mapping at the bottom to process out_of_stock_shops
code = code.replace(
`      const shops: ShopEntry[] = (r.shops || []).map((s: any) => ({
        ...s,
        distance_km: s.distance_km === null ? null : Number(s.distance_km),
        price: Number(s.price),
        avg_rating: s.avg_rating === null ? null : Number(s.avg_rating)
      }));

      return {
        product: {`,
`      const shops: ShopEntry[] = (r.shops || []).map((s: any) => ({
        ...s,
        distance_km: s.distance_km === null ? null : Number(s.distance_km),
        price: Number(s.price),
        avg_rating: s.avg_rating === null ? null : Number(s.avg_rating)
      }));

      const outOfStockShops: ShopEntry[] = (r.out_of_stock_shops || []).map((s: any) => ({
        ...s,
        distance_km: s.distance_km === null ? null : Number(s.distance_km),
        price: Number(s.price),
        avg_rating: s.avg_rating === null ? null : Number(s.avg_rating)
      }));

      return {
        product: {`
);

// 7. Expose out_of_stock_shops in returned structure
code = code.replace(
`        market_stats: {
          min_price: r.min_price !== null ? Number(r.min_price) : null,
          max_price: r.max_price !== null ? Number(r.max_price) : null,
          avg_price: r.avg_price !== null ? Number(r.avg_price) : null,
          currency: 'MWK',
          total_active_shops: Number(r.total_active_shops || 0),
          conditions_available: r.conditions_available || [],
          total_shops: Number(r.total_shops || 0)
        },
        shops
      };`,
`        market_stats: {
          min_price: r.min_price !== null ? Number(r.min_price) : null,
          max_price: r.max_price !== null ? Number(r.max_price) : null,
          avg_price: r.avg_price !== null ? Number(r.avg_price) : null,
          currency: 'MWK',
          total_active_shops: Number(r.total_active_shops || 0),
          conditions_available: r.conditions_available || [],
          total_shops: Number(r.total_shops || 0)
        },
        shops,
        out_of_stock_shops: outOfStockShops
      };`
);

fs.writeFileSync(filePath, code);
console.log('Update complete');
