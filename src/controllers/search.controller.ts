import { Request, Response } from "express";
import prisma from "../prismaClient";

// Helper: Malawi latitude bounds
const MALAWI_LAT_MIN = -17.5;
const MALAWI_LAT_MAX = -9.0;

export const search = async (req: Request, res: Response) => {
  let __debug_sql: string | undefined = undefined;
  try {
    // Parsed & validated query should be provided by validateResource middleware.
    // But we defensively coerce here to support calls without validation.
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = req.query.page ? Number(req.query.page) : 1;
    const rawLimit = req.query.limit ? Number(req.query.limit) : 20;
    const limit = Math.min(Math.max(1, rawLimit || 20), 50); // cap to 50
    const offset = (Math.max(1, page) - 1) * limit;

    const latVal = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lngVal = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const radius = req.query.radiusKm ? Number(req.query.radiusKm) : 15;

    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const condition = typeof req.query.condition === "string" ? req.query.condition : undefined;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const ram = typeof req.query.ram === "string" ? req.query.ram : undefined;
    const storage = typeof req.query.storage === "string" ? req.query.storage : undefined;

    // Decide whether to use geo filtering: must have valid lat & lng and be within Malawi latitude bounds.
    const hasCoords = !Number.isNaN(latVal) && !Number.isNaN(lngVal) && latVal !== undefined && lngVal !== undefined;
    const inMalawiLat = hasCoords && latVal >= MALAWI_LAT_MIN && latVal <= MALAWI_LAT_MAX;
    const useGeo = hasCoords && inMalawiLat;

    // Build small SQL fragments defensively and avoid Prisma.sql helpers which may not be available in this runtime
    const escapeLiteral = (s: string) => s.replace(/'/g, "''");

    const conds: string[] = [];
    if (condition) conds.push(`AND sp.condition = '${escapeLiteral(condition)}'`);
    if (minPrice !== undefined) conds.push(`AND sp.price >= ${Number(minPrice)}`);
    if (maxPrice !== undefined) conds.push(`AND sp.price <= ${Number(maxPrice)}`);
    if (city) conds.push(`AND lower(s.city) = lower('${escapeLiteral(city)}')`);
    if (ram) conds.push(`AND (sp.specs->>'ram') = '${escapeLiteral(ram)}'`);
    if (storage) conds.push(`AND (sp.specs->>'storage') = '${escapeLiteral(storage)}'`);

    const tsvCondition = q
      ? `(to_tsvector('english', coalesce(p.name, '') || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.model, '')) @@ plainto_tsquery('english', '${escapeLiteral(
          q
        )}') OR p.name ILIKE '%${escapeLiteral(q)}%' OR p.brand ILIKE '%${escapeLiteral(q)}%' OR p.model ILIKE '%${escapeLiteral(
          q
        )}%' OR similarity(coalesce(p.normalized_name, ''), '${escapeLiteral(q)}') > 0.55)`
      : 'true';

    const orderBy = useGeo
      ? `(ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${lngVal}, ${latVal}),4326)::geography)/1000) ASC, stats.min_price ASC NULLS LAST`
      : `stats.min_price ASC NULLS LAST`;

    const searchType = useGeo ? 'LOCAL' : 'NATIONWIDE';

    const whereExtra = conds.join(' ');

    const sql = `
      SELECT
        json_build_object('id', p.id, 'title', p.name, 'brand', p.brand) AS base_product,
        json_build_object(
          'price_range', json_build_object('min', stats.min_price, 'max', stats.max_price),
          'total_active_shops', COALESCE(stats.total_active_shops, 0),
          'conditions_available', COALESCE(stats.conditions_available::text[], ARRAY[]::text[])
        ) AS market_stats,
        json_build_object(
          'shop_name', COALESCE(nearest.shop_name, ''),
          'distance_km', nearest.distance_km,
          'price', COALESCE(nearest.price, 0),
          'condition', COALESCE(nearest.condition::text, 'UNKNOWN'),
          'is_free_delivery', COALESCE(nearest.is_free_delivery, false),
          'delivery_zone', COALESCE(nearest.delivery_zone, 'NATIONWIDE')
        ) AS nearest_deal
      FROM products p

      JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE sp.stock_quantity > 0 AND sp.listing_status = 'LIVE') AS total_active_shops,
          MIN(sp.price) FILTER (WHERE sp.stock_quantity > 0 AND sp.listing_status = 'LIVE') AS min_price,
          MAX(sp.price) FILTER (WHERE sp.stock_quantity > 0 AND sp.listing_status = 'LIVE') AS max_price,
          array_remove(array_agg(DISTINCT sp.condition) FILTER (WHERE sp.stock_quantity > 0 AND sp.listing_status = 'LIVE'), NULL) AS conditions_available
        FROM shop_products sp
        JOIN shops s ON s.id = sp.shop_id
        WHERE sp.product_id = p.id
          AND sp.stock_quantity > 0
          AND sp.listing_status = 'LIVE'
          ${whereExtra}
      ) stats ON true

      JOIN LATERAL (
        SELECT
          COALESCE(s.name, '') AS shop_name,
          sp.price,
          sp.condition,
          ${useGeo ? `(ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${lngVal}, ${latVal}),4326)::geography)/1000)::double precision` : `NULL`} AS distance_km,
          ${useGeo ? `(ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(${lngVal}, ${latVal}),4326)::geography, ${radius} * 1000) AND sp.price >= COALESCE(s.free_delivery_threshold, 0))` : `false`} AS is_free_delivery,
          ${useGeo ? `(CASE WHEN ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(${lngVal}, ${latVal}),4326)::geography, ${radius} * 1000) THEN 'LOCAL_DELIVERY' ELSE 'OTHER' END)` : `'NATIONWIDE'`} AS delivery_zone
        FROM shop_products sp
        JOIN shops s ON s.id = sp.shop_id
        WHERE sp.product_id = p.id
          AND sp.stock_quantity > 0
          AND sp.listing_status = 'LIVE'
          ${whereExtra}
        ORDER BY ${orderBy}
        LIMIT 1
      ) nearest ON true

      WHERE
        ${tsvCondition}
        AND (stats.total_active_shops > 0)

      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset};
    `;

    // Log SQL for debugging (temporary)
    __debug_sql = sql;
    console.debug("[search] executing SQL:\n", sql);
    const rows: Array<{ base_product: any; market_stats: any; nearest_deal: any }> = await prisma.$queryRawUnsafe(sql);

    // Ensure empty-state success
    if (!rows || rows.length === 0) {
      res.setHeader('X-Search-Type', searchType);
      return res.status(200).json({ results: [], metadata: { total_results: 0, search_radius_km: radius } });
    }

    const metadata = { total_results: rows.length, search_radius_km: radius };
    res.setHeader('X-Search-Type', searchType);
    const results = rows.map((r) => ({ base_product: r.base_product, market_stats: r.market_stats, nearest_deal: r.nearest_deal }));
    return res.json({ results, metadata });
  } catch (err) {
    console.error("Search error:", err);
    try {
      // expose SQL if available for debugging
      // @ts-ignore
      if (err && err.message) console.error("Search error message:", err.message);
    } catch (e) {
      // ignore
    }
    const debug = process.env.SEARCH_DEBUG === '1' || process.env.NODE_ENV === 'development';
    if (debug) {
      // expose error message and SQL for temporary debugging (do not enable in production)
      // @ts-ignore
      return res.status(500).json({ error: "Search failed", message: err?.message ?? String(err), sql: __debug_sql ? __debug_sql.substring(0, 2000) : undefined });
    }
    return res.status(500).json({ error: "Search failed" });
  }
};
