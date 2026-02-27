import { Request, Response } from "express";
import prisma from "../prismaClient";
import { Prisma } from '../../generated/prisma';


// Types for response shaping
type ShopEntry = {
  shop_product_id: string;
  shop_id: string;
  shop_name: string | null;
  shop_logo: string | null;
  distance_km: number | null;
  price: number;
  currency: string;
  condition: string | null;
  stock_quantity: number;
  is_free_delivery: boolean;
  delivery_zones: string[] | null;
  listing_status: string | null;
  variant_values: any;
  avg_rating: number | null;
  review_count: number;
};

type ProductResult = {
  product: any;
  market_stats: any;
  shops: ShopEntry[];
};

// Removed escapeLike: we use parameterized queries (Prisma.sql) to avoid SQL injection

export const search = async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const brandRaw = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';
    const modelRaw = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    // Fix 5: explicit validation for query length (must be 2-100 chars)
    if (qRaw.length < 2) {
      return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_QUERY', message: 'Search query must be at least 2 characters' } });
    }
    if (qRaw.length > 100) {
      return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_QUERY', message: 'Search query must not exceed 100 characters' } });
    }
    const q = qRaw; // validated
    const brand = brandRaw === '' ? null : brandRaw;
    const model = modelRaw === '' ? null : modelRaw;
    const page = req.query.page ? Math.max(1, Number(req.query.page)) : 1;
    const rawLimit = req.query.limit ? Number(req.query.limit) : 20;
    const limit = Math.min(Math.max(1, rawLimit || 20), 50);
    const offset = (page - 1) * limit;

    const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
    const buyerHasCoords = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

    const condition = typeof req.query.condition === 'string' ? req.query.condition : null;
    const minPrice = req.query.min_price ? Number(req.query.min_price) : null;
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : null;
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : null;
    // Specs filter: URL-encoded JSON object, e.g. ?specs={"Storage":"256GB"}
    let specsObj: any = null;
    if (typeof req.query.specs === 'string' && req.query.specs.trim() !== '') {
      try {
        specsObj = JSON.parse(req.query.specs as string);
        if (typeof specsObj !== 'object' || Array.isArray(specsObj)) {
          return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_SPECS', message: 'Spec filter must be a JSON object' } });
        }
      } catch (e) {
        return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_SPECS', message: 'Spec filter must be valid JSON' } });
      }
    }

    // Build a single parameterized SQL template using prisma.$queryRaw tagged template
    const searchParam = `%${q.toLowerCase()}%`;
    const qPlain = q.toLowerCase();
    const similarityThreshold = Number(process.env.SEARCH_SIMILARITY || '0.28');
    const brandParam = brand ? `%${brand.toLowerCase()}%` : null;
    const modelParam = model ? `%${model.toLowerCase()}%` : null;

    // Build specs SQL fragment: match either listing-level (`sp`) OR product-level (`p`) specs/variant_values
    let specsSqlFragment: any = null;
    if (specsObj) {
      const parts: any[] = [];
      for (const [k, v] of Object.entries(specsObj)) {
        const valPattern = `%${String(v)}%`;
        parts.push(Prisma.sql`(
          (
            EXISTS (
              SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.specs::jsonb) = 'object' THEN sp.specs::jsonb ELSE '{}'::jsonb END) e
              WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.variant_values::jsonb) = 'object' THEN sp.variant_values::jsonb ELSE '{}'::jsonb END) e
              WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
            )
          )
          OR
          (
            EXISTS (
              SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.specs::jsonb) = 'object' THEN p.specs::jsonb ELSE '{}'::jsonb END) e
              WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.variant_values::jsonb) = 'object' THEN p.variant_values::jsonb ELSE '{}'::jsonb END) e
              WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
            )
          )
        )`);
      }
      specsSqlFragment = parts.reduce((a, b) => Prisma.sql`${a} AND ${b}`);
    }

    const rawRows: any = await prisma.$queryRaw<any[]>`
WITH canonical_products AS (
  SELECT p.id, p.name, p.brand, p.normalized_name, p.model, p.category_id, p.images, p.gtin, p.mpn,
         GREATEST(
           similarity(lower(coalesce(p.name,'')), ${qPlain}),
           similarity(lower(coalesce(p.normalized_name,'')), ${qPlain}),
           similarity(lower(coalesce(p.brand,'')), ${qPlain})
         ) AS match_score
  FROM products p
  WHERE p.status = 'APPROVED'
    AND coalesce(p.is_active,false) = true
    AND p.merged_into_id IS NULL
    AND (
      lower(p.normalized_name) LIKE ${searchParam}
      OR lower(p.name) LIKE ${searchParam}
      OR lower(p.brand) LIKE ${searchParam}
      OR (lower(coalesce(p.name,'')) % ${qPlain} OR similarity(lower(coalesce(p.name,'')), ${qPlain}) > ${similarityThreshold})
      OR (lower(coalesce(p.normalized_name,'')) % ${qPlain} OR similarity(lower(coalesce(p.normalized_name,'')), ${qPlain}) > ${similarityThreshold})
      OR (lower(coalesce(p.brand,'')) % ${qPlain} OR similarity(lower(coalesce(p.brand,'')), ${qPlain}) > ${similarityThreshold})
    )
      AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
      AND (${brandParam}::text IS NULL OR lower(coalesce(p.brand, '')) LIKE ${brandParam})
      AND (${modelParam}::text IS NULL OR lower(coalesce(p.model, '')) LIKE ${modelParam})
),
active_listings AS (
  SELECT
    sp.id,
    sp.product_id AS product_id,
    sp.shop_id,
    sp.price,
    sp.stock_quantity,
    sp.condition::text AS condition,
    sp.variant_values,
    sp.listing_status,
    s.name AS shop_name,
    s.logo AS shop_logo,
    s.delivery_zones,
    s.free_delivery_threshold,
    (CASE WHEN ${buyerHasCoords}::boolean THEN ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${lng}::numeric, ${lat}::numeric),4326)::geography)/1000.0 ELSE NULL END) AS distance_km,
    (CASE WHEN s.free_delivery_threshold IS NOT NULL AND sp.price >= s.free_delivery_threshold THEN true ELSE false END) AS is_free_delivery,
    r.avg_rating AS avg_rating,
    COALESCE(r.review_count, 0) AS review_count
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
    AND (${condition}::text IS NULL OR sp.condition::text = ${condition}::text)
    AND (${minPrice}::numeric IS NULL OR sp.price >= ${minPrice}::numeric)
    AND (${maxPrice}::numeric IS NULL OR sp.price <= ${maxPrice}::numeric)
    AND (
      ${specsSqlFragment === null ? Prisma.sql`TRUE` : Prisma.sql`${specsSqlFragment}`}
    )
),
linked_listings AS (
  -- Listings whose product is canonical
  SELECT al.*, al.product_id AS canonical_product_id
  FROM active_listings al
  JOIN products p ON p.id = al.product_id
  WHERE p.merged_into_id IS NULL
    AND p.status = 'APPROVED'

  UNION ALL

  -- Listings whose product has been merged into a canonical product
  SELECT al.*, p2.merged_into_id AS canonical_product_id
  FROM active_listings al
  JOIN products p2 ON p2.id = al.product_id
  WHERE p2.merged_into_id IS NOT NULL
    AND p2.status = 'MERGED'
),
aggregated AS (
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
)
,
facets_cte AS (
  SELECT json_build_object(
    'conditions', (
      SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('value', condition, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT al.condition AS condition, COUNT(*) AS cnt
        FROM linked_listings al
        WHERE al.condition IS NOT NULL
          AND al.canonical_product_id IN (SELECT id FROM canonical_products)
        GROUP BY al.condition
        ORDER BY cnt DESC
      ) t
    ),
    'brands', (
      SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('value', b.brand, 'count', b.cnt) ORDER BY b.cnt DESC), '[]'::json)
      FROM (
        SELECT cp.brand AS brand, COUNT(*) AS cnt
        FROM canonical_products cp
        GROUP BY cp.brand
        ORDER BY cnt DESC
      ) b
    ),
    'models', (
      SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('value', m.model, 'count', m.cnt) ORDER BY m.cnt DESC), '[]'::json)
      FROM (
        SELECT cp.model AS model, COUNT(*) AS cnt
        FROM canonical_products cp
        WHERE cp.model IS NOT NULL AND trim(cp.model) <> ''
        GROUP BY cp.model
        ORDER BY cnt DESC
      ) m
    ),
    'price_range', (
      SELECT json_build_object('min', MIN(al.price), 'max', MAX(al.price), 'currency', 'MWK')
      FROM linked_listings al
      WHERE al.canonical_product_id IN (SELECT id FROM canonical_products)
    )
  ) AS facets
)
SELECT
  cp.id AS product_id,
  cp.name,
  cp.brand,
  cp.normalized_name,
  cp.model,
  cp.category_id,
  cp.images,
  cp.gtin,
  cp.mpn,
  agg.min_price,
  agg.max_price,
  agg.avg_price,
  agg.total_active_shops,
  agg.conditions_available,
  agg.total_shops,
  agg.shops,
  agg.match_score,
  facets_cte.facets,
  COUNT(*) OVER() AS total_count
FROM canonical_products cp
JOIN aggregated agg ON agg.canonical_product_id = cp.id
JOIN facets_cte ON true
ORDER BY agg.min_price ASC NULLS LAST, cp.match_score DESC
LIMIT ${limit} OFFSET ${offset};
`;

  // Ensure rows is always an array (Prisma may sometimes return an object)
  let rows: any[] = Array.isArray(rawRows) ? rawRows : (rawRows ? [rawRows] : []);

  // Prisma sometimes returns a wrapper like { data: [ ... ] } when using certain drivers.
  // If so, unwrap it to get the actual array of result rows.
  if (
    rows.length === 1 &&
    rows[0] &&
    typeof rows[0] === 'object' &&
    Array.isArray((rows[0] as any).data) &&
    (rows[0] as any).data.length > 0 &&
    typeof (rows[0] as any).data[0].product_id !== 'undefined'
  ) {
    rows = (rows[0] as any).data;
  }

  // Extract facets if the query attached facets to each row (facets_cte was joined)
  let facets: any = { conditions: [], brands: [], models: [], price_range: { min: null, max: null, currency: 'MWK' } };
  if (rows.length > 0 && rows[0].facets) {
    facets = rows[0].facets;
    // remove facets from individual rows to avoid duplication
    rows = rows.map((r: any) => {
      const copy = { ...r };
      delete copy.facets;
      return copy;
    });
  }

  // Format results
  const results: ProductResult[] = (rows || []).map((r) => {
      const shopsRaw = r.shops || [];
      const shops: ShopEntry[] = (shopsRaw as any[]).map((s: any) => ({
        shop_product_id: s.shop_product_id,
        shop_id: s.shop_id,
        shop_name: s.shop_name ?? null,
        shop_logo: s.shop_logo ?? null,
        distance_km: s.distance_km === null ? null : Number(s.distance_km),
        price: s.price !== null ? Number(s.price) : 0,
        currency: 'MWK',
        condition: s.condition ?? null,
        stock_quantity: s.stock_quantity ?? 0,
        is_free_delivery: !!s.is_free_delivery,
        delivery_zones: s.delivery_zones ?? null,
        listing_status: s.listing_status ?? null,
        variant_values: s.variant_values ?? null,
        avg_rating: s.avg_rating === null ? null : Number(s.avg_rating),
        review_count: s.review_count ?? 0
      }));

      return {
        product: {
          id: r.product_id,
          name: r.name,
          brand: r.brand ?? null,
          normalized_name: r.normalized_name ?? null,
          model: r.model ?? null,
          category_id: r.category_id ?? null,
          thumbnail_url: Array.isArray(r.images) && r.images.length ? r.images[0] : null,
          images: r.images || [],
          gtin: r.gtin ?? null,
          mpn: r.mpn ?? null,
          match_score: r.match_score !== null && typeof r.match_score !== 'undefined' ? Number(Number(r.match_score).toFixed(4)) : null
        },
        market_stats: {
          min_price: r.min_price !== null ? Number(r.min_price) : null,
          max_price: r.max_price !== null ? Number(r.max_price) : null,
          avg_price: r.avg_price !== null ? Number(r.avg_price) : null,
          currency: 'MWK',
          total_active_shops: Number(r.total_active_shops || 0),
          conditions_available: r.conditions_available || [],
          total_shops: Number(r.total_shops || 0)
        },
        shops
      };
    });

    const responseTime = Date.now() - start;
    // Fix 4: compute total_results from windowed total_count
    const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

    // Zero-results suggestions: if no results, query for up to 5 similar approved products
    let suggestions: string[] = [];
    if (totalCount === 0) {
      try {
        const sugRows: any[] = await prisma.$queryRaw<any[]>`
          SELECT DISTINCT p.name, p.brand, GREATEST(
            similarity(lower(coalesce(p.name,'')), ${qPlain}),
            similarity(lower(coalesce(p.brand,'')), ${qPlain})
          ) AS score
          FROM products p
          WHERE p.status = 'APPROVED'
            AND coalesce(p.is_active,false) = true
            AND p.merged_into_id IS NULL
            AND (
              similarity(lower(coalesce(p.name,'')), ${qPlain}) > 0.1
              OR similarity(lower(coalesce(p.brand,'')), ${qPlain}) > 0.1
            )
          ORDER BY score DESC
          LIMIT 5
        `;
        const seen = new Set<string>();
        for (const s of (sugRows || [])) {
          const name = s.name ? String(s.name).trim() : '';
          const brandVal = s.brand ? String(s.brand).trim() : '';
          const txt = [name, brandVal].filter(Boolean).join(' ').trim();
          if (txt && !seen.has(txt)) {
            seen.add(txt);
            suggestions.push(txt);
          }
        }
      } catch (e) {
        // don't fail the search on suggestion errors
        // eslint-disable-next-line no-console
        console.error('SEARCH_SUGGESTIONS_ERROR', e);
        suggestions = [];
      }
    }

    const metadata = {
      query: qRaw,
      page,
      limit,
      total_results: totalCount,
      returned_results: results.length,
      has_next_page: offset + results.length < totalCount,
      has_prev_page: page > 1,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / limit) : 0,
      from: totalCount > 0 && results.length > 0 ? offset + 1 : 0,
      to: totalCount > 0 && results.length > 0 ? offset + results.length : 0,
      currency: 'MWK',
      buyer_location_provided: buyerHasCoords,
      response_time_ms: responseTime,
      suggestions
    };

    // Send response (facets computed in SQL and extracted earlier)
    res.json({ success: true, metadata, facets, results, error: null });

    // Fire-and-forget: log search to search_logs table asynchronously
    try {
      const filtersObj = {
        brand: brand || null,
        model: model || null,
        condition: condition || null,
        category_id: categoryId || null,
        min_price: minPrice,
        max_price: maxPrice,
        specs: specsObj || null
      };
      prisma.$executeRaw`
        INSERT INTO search_logs (query, results_count, filters, buyer_has_coords, response_time_ms, page, limit_per_page)
        VALUES (${qRaw}, ${totalCount}, ${JSON.stringify(filtersObj)}::jsonb, ${buyerHasCoords}, ${responseTime}, ${page}, ${limit})
      `.catch((e) => {
        // eslint-disable-next-line no-console
        console.error('SEARCH_LOG_ERROR', e);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('SEARCH_LOG_PREP_ERROR', e);
    }

    return;
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ success: false, metadata: null, results: [], error: { code: 'SEARCH_FAILED', message: (err as any)?.message ?? 'Search failed' } });
  }
};
