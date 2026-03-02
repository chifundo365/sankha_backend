import { Request, Response } from "express";
import prisma from "../prismaClient";
import { Prisma } from "../../generated/prisma";
import { SearchQuery } from "../schemas/search.schema";
import { errorResponse } from "../utils/response";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  variant_values: unknown;
  avg_rating: number | null;
  review_count: number;
};

type ProductResult = {
  product: Record<string, unknown>;
  market_stats: Record<string, unknown>;
  shops: ShopEntry[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Prisma.sql fragment that ANDs together per-key JSONB spec filters.
 * Keys and values have already been sanitised + length-capped by the Zod
 * schema so we only need to parameterise them here.
 */
function buildSpecsFragment(specs: Record<string, string>) {
  const parts = Object.entries(specs).map(([k, v]) => {
    const valPattern = `%${v}%`;
    return Prisma.sql`(
      (
        EXISTS (
          SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.specs::jsonb) = 'object' THEN sp.specs::jsonb ELSE '{}'::jsonb END) e
          WHERE lower(e.key) = lower(${k}) AND lower(e.value) LIKE lower(${valPattern})
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(sp.variant_values::jsonb) = 'object' THEN sp.variant_values::jsonb ELSE '{}'::jsonb END) e
          WHERE lower(e.key) = lower(${k}) AND lower(e.value) LIKE lower(${valPattern})
        )
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.specs::jsonb) = 'object' THEN p.specs::jsonb ELSE '{}'::jsonb END) e
          WHERE lower(e.key) = lower(${k}) AND lower(e.value) LIKE lower(${valPattern})
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.variant_values::jsonb) = 'object' THEN p.variant_values::jsonb ELSE '{}'::jsonb END) e
          WHERE lower(e.key) = lower(${k}) AND lower(e.value) LIKE lower(${valPattern})
        )
      )
    )`;
  });

  return parts.reduce((a, b) => Prisma.sql`${a} AND ${b}`);
}

function mapRowToResult(r: any): ProductResult {
  const shops: ShopEntry[] = (r.shops || []).map((s: any) => ({
    ...s,
    distance_km: s.distance_km === null ? null : Number(s.distance_km),
    price: Number(s.price),
    avg_rating: s.avg_rating === null ? null : Number(s.avg_rating),
  }));

  return {
    product: {
      id: r.product_id,
      name: r.name,
      brand: r.brand ?? null,
      normalized_name: r.normalized_name ?? null,
      model: r.model ?? null,
      category_id: r.category_id ?? null,
      thumbnail_url:
        Array.isArray(r.images) && r.images.length ? r.images[0] : null,
      images: r.images || [],
      gtin: r.gtin ?? null,
      mpn: r.mpn ?? null,
      match_score:
        r.match_score !== null
          ? Number(Number(r.match_score).toFixed(4))
          : null,
    },
    market_stats: {
      min_price: r.min_price !== null ? Number(r.min_price) : null,
      max_price: r.max_price !== null ? Number(r.max_price) : null,
      avg_price: r.avg_price !== null ? Number(r.avg_price) : null,
      currency: "MWK",
      total_active_shops: Number(r.total_active_shops || 0),
      conditions_available: r.conditions_available || [],
      total_shops: Number(r.total_shops || 0),
    },
    shops,
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const search = async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    // ── Validated & transformed query params (Zod schema runs in middleware) ──
    const {
      q,
      brand: brandInput,
      model: modelInput,
      page,
      limit,
      lat,
      lng,
      radius_km: radiusKm,
      condition,
      min_price: minPrice,
      max_price: maxPrice,
      category_id: categoryId,
      specs: specsObj,
    } = req.query as unknown as SearchQuery;

    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 20;
    const offset = (safePage - 1) * safeLimit;
    const qPlain = q.toLowerCase();
    const searchParam = `%${qPlain}%`;

    // Dynamic similarity threshold: short queries produce inflated trigram
    // scores so we require a higher match quality for them.
    const baseSimilarity = Number(process.env.SEARCH_SIMILARITY || "0.2");
    const similarityThreshold = qPlain.length <= 3
      ? Math.max(baseSimilarity, 0.5)   // short query → require ≥ 0.5
      : qPlain.length <= 5
        ? Math.max(baseSimilarity, 0.35) // medium query → require ≥ 0.35
        : baseSimilarity;                // normal query → use configured value

    const brand = brandInput || null;
    const model = modelInput || null;
    const brandParam = brand ? `%${brand.toLowerCase()}%` : null;
    const modelParam = model ? `%${model.toLowerCase()}%` : null;

    const buyerHasCoords =
      lat !== undefined &&
      lng !== undefined &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng);
    const safeLat = buyerHasCoords ? lat : 0;
    const safeLng = buyerHasCoords ? lng : 0;
    const radiusMeters = radiusKm * 1000; // ST_DWithin uses metres

    const conditionParam = condition ?? null;
    const minPriceParam = minPrice ?? null;
    const maxPriceParam = maxPrice ?? null;
    const categoryIdParam = categoryId ?? null;

    // Build specs SQL fragment (keys/values already sanitised by Zod)
    const specsSqlFragment = specsObj
      ? buildSpecsFragment(specsObj)
      : null;

    // ── Main search query ──────────────────────────────────────────────────
    const rawRows: any[] = await prisma.$queryRaw<any[]>`
WITH canonical_products AS (
  SELECT p.id, p.name, p.brand, p.normalized_name, p.model, p.category_id, p.images, p.gtin, p.mpn,
          GREATEST(
            word_similarity(${qPlain}, lower(coalesce(p.name,''))),
            word_similarity(${qPlain}, lower(coalesce(p.normalized_name,''))),
            word_similarity(${qPlain}, lower(coalesce(p.brand,'')))
          ) AS match_score
  FROM products p
  WHERE p.status = 'APPROVED'
    AND coalesce(p.is_active,false) = true
    AND p.merged_into_id IS NULL
    AND (
      lower(p.normalized_name) LIKE ${searchParam}
      OR lower(p.name) LIKE ${searchParam}
      OR lower(p.brand) LIKE ${searchParam}
      OR word_similarity(${qPlain}, lower(coalesce(p.name,''))) > ${similarityThreshold}
      OR word_similarity(${qPlain}, lower(coalesce(p.normalized_name,''))) > ${similarityThreshold}
      OR word_similarity(${qPlain}, lower(coalesce(p.brand,''))) > ${similarityThreshold}
    )
      AND (${categoryIdParam}::uuid IS NULL OR p.category_id = ${categoryIdParam}::uuid)
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
    (CASE WHEN ${buyerHasCoords}::boolean THEN ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${safeLng}::numeric, ${safeLat}::numeric),4326)::geography)/1000.0 ELSE NULL END) AS distance_km,
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
    AND (${conditionParam}::text IS NULL OR sp.condition::text = ${conditionParam}::text)
    AND (${minPriceParam}::numeric IS NULL OR sp.price >= ${minPriceParam}::numeric)
    AND (${maxPriceParam}::numeric IS NULL OR sp.price <= ${maxPriceParam}::numeric)
    AND (
      ${specsSqlFragment === null ? Prisma.sql`TRUE` : Prisma.sql`${specsSqlFragment}`}
    )
    AND (
      ${buyerHasCoords}::boolean = false
      OR ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${safeLng}::numeric, ${safeLat}::numeric), 4326)::geography,
        ${radiusMeters}::double precision
      )
    )
),
linked_listings AS (
  SELECT al.*, al.product_id AS canonical_product_id
  FROM active_listings al
  JOIN products p ON p.id = al.product_id
  WHERE p.merged_into_id IS NULL AND p.status = 'APPROVED'
  UNION ALL
  SELECT al.*, p2.merged_into_id AS canonical_product_id
  FROM active_listings al
  JOIN products p2 ON p2.id = al.product_id
  WHERE p2.merged_into_id IS NOT NULL AND p2.status = 'MERGED'
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
),
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
      ) t
    ),
    'brands', (
      SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('value', brand, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT cp.brand AS brand, COUNT(DISTINCT cp.id) AS cnt
        FROM canonical_products cp
        JOIN linked_listings al ON al.canonical_product_id = cp.id
        WHERE cp.brand IS NOT NULL AND trim(cp.brand) <> ''
        GROUP BY cp.brand
      ) b
    ),
    'models', (
      SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('value', model, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT cp.model AS model, COUNT(DISTINCT cp.id) AS cnt
        FROM canonical_products cp
        JOIN linked_listings al ON al.canonical_product_id = cp.id
        WHERE cp.model IS NOT NULL AND trim(cp.model) <> ''
        GROUP BY cp.model
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
  cp.name, cp.brand, cp.normalized_name, cp.model, cp.category_id, cp.images, cp.gtin, cp.mpn,
  agg.min_price, agg.max_price, agg.avg_price, agg.total_active_shops, agg.conditions_available, agg.total_shops, agg.shops, agg.match_score,
  facets_cte.facets,
  COUNT(*) OVER() AS total_count
FROM canonical_products cp
JOIN aggregated agg ON agg.canonical_product_id = cp.id
JOIN facets_cte ON true
ORDER BY agg.min_price ASC NULLS LAST, cp.match_score DESC
LIMIT ${safeLimit} OFFSET ${offset};
`;

    // ── Shape rows ─────────────────────────────────────────────────────────
    let rows: any[] = Array.isArray(rawRows)
      ? rawRows
      : rawRows
        ? [rawRows]
        : [];
    if (
      rows.length === 1 &&
      rows[0] &&
      typeof rows[0] === "object" &&
      Array.isArray((rows[0] as any).data)
    ) {
      rows = (rows[0] as any).data;
    }

    let facets: any = {
      conditions: [],
      brands: [],
      models: [],
      price_range: { min: null, max: null, currency: "MWK" },
    };
    if (rows.length > 0 && rows[0].facets) {
      facets = rows[0].facets;
      rows = rows.map((r: any) => {
        const { facets: _f, ...rest } = r;
        return rest;
      });
    }

    const results: ProductResult[] = rows.map(mapRowToResult);

    const responseTime = Date.now() - start;
    const totalCount =
      rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

    // ── "Did you mean?" suggestions when no results ────────────────────────
    let suggestions: string[] = [];
    if (totalCount === 0) {
      const sugRaw = await prisma.$queryRaw`
        SELECT DISTINCT p.name, p.brand,
               word_similarity(${qPlain}, lower(coalesce(p.name,''))) AS score
        FROM products p
        WHERE p.status = 'APPROVED' AND p.is_active = true AND p.merged_into_id IS NULL
          AND word_similarity(${qPlain}, lower(coalesce(p.name,''))) > 0.15
        ORDER BY score DESC LIMIT 5`;
      const sugRows: any[] = Array.isArray(sugRaw)
        ? sugRaw
        : (sugRaw && typeof sugRaw === "object" && Array.isArray((sugRaw as any).data))
          ? (sugRaw as any).data
          : [];
      suggestions = sugRows.map(
        (s: any) => `${s.name} ${s.brand || ""}`.trim()
      );
    }

    // ── Response ───────────────────────────────────────────────────────────
    const metadata = {
      query: q,
      page: safePage,
      limit: safeLimit,
      total_results: totalCount,
      returned_results: results.length,
      has_next_page: offset + results.length < totalCount,
      has_prev_page: safePage > 1,
      total_pages: Math.ceil(totalCount / safeLimit) || 0,
      from: totalCount > 0 ? offset + 1 : 0,
      to: offset + results.length,
      currency: "MWK",
      buyer_location_provided: buyerHasCoords,
      response_time_ms: responseTime,
      suggestions,
    };

    res.json({ success: true, metadata, facets, results, error: null });

    // ── Fire-and-forget analytics logging ──────────────────────────────────
    const filtersObj = {
      brand,
      model,
      condition: conditionParam,
      category_id: categoryIdParam,
      minPrice: minPriceParam,
      maxPrice: maxPriceParam,
      specs: specsObj ?? null,
    };
    prisma.$executeRaw`
      INSERT INTO search_logs (query, results_count, filters, buyer_has_coords, response_time_ms, page, limit_per_page)
      VALUES (${q}, ${totalCount}, ${JSON.stringify(filtersObj)}::jsonb, ${buyerHasCoords}, ${responseTime}, ${page}, ${limit})
    `.catch(() => {});
  } catch (err: unknown) {
    // Never leak internal error details to the client
    console.error("Search error:", err);
    return errorResponse(res, "Search failed", undefined, 500);
  }
};