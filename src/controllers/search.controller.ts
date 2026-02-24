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
    // Fix 5: explicit validation for query length (must be 2-100 chars)
    if (qRaw.length < 2) {
      return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_QUERY', message: 'Search query must be at least 2 characters' } });
    }
    if (qRaw.length > 100) {
      return res.status(400).json({ success: false, metadata: null, results: [], error: { code: 'INVALID_QUERY', message: 'Search query must not exceed 100 characters' } });
    }
    const q = qRaw; // validated
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

    // Build specs SQL fragment: case-insensitive key match + value ILIKE
    let specsSqlFragment: any = null;
    if (specsObj) {
      const parts: any[] = [];
      for (const [k, v] of Object.entries(specsObj)) {
        const valPattern = `%${String(v)}%`;
        parts.push(Prisma.sql`(
          EXISTS (
            SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.specs::jsonb) = 'object' THEN sp.specs::jsonb ELSE '{}'::jsonb END) e
            WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.variant_values::jsonb) = 'object' THEN sp.variant_values::jsonb ELSE '{}'::jsonb END) e
            WHERE lower(e.key) = lower(${String(k)}) AND lower(e.value) LIKE lower(${valPattern})
          )
        )`);
      }
      specsSqlFragment = parts.reduce((a, b) => Prisma.sql`${a} AND ${b}`);
    }

    const rows: any[] = await prisma.$queryRaw<any[]>`
WITH canonical_products AS (
  SELECT p.id, p.name, p.brand, p.normalized_name, p.model, p.category_id, p.images, p.gtin, p.mpn
  FROM products p
  WHERE p.status = 'APPROVED'
    AND coalesce(p.is_active,false) = true
    AND p.merged_into_id IS NULL
    AND (lower(p.normalized_name) LIKE ${searchParam} OR lower(p.name) LIKE ${searchParam} OR lower(p.brand) LIKE ${searchParam})
    AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
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
  GROUP BY cp.id
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
  COUNT(*) OVER() AS total_count
FROM canonical_products cp
JOIN aggregated agg ON agg.canonical_product_id = cp.id
ORDER BY agg.min_price ASC NULLS LAST
LIMIT ${limit} OFFSET ${offset};
`;

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
          mpn: r.mpn ?? null
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
    const metadata = {
      query: qRaw,
      page,
      limit,
      total_results: totalCount,
      returned_results: results.length,
      has_next_page: offset + results.length < totalCount,
      currency: 'MWK',
      buyer_location_provided: buyerHasCoords,
      response_time_ms: responseTime
    };

    return res.json({ success: true, metadata, results, error: null });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ success: false, metadata: null, results: [], error: { code: 'SEARCH_FAILED', message: (err as any)?.message ?? 'Search failed' } });
  }
};
