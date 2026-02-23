Search implementation and flow — shop-tech_backend

Overview

This document explains how searching and product matching currently work in the codebase, where the logic lives, the run-time flow, fallback behavior when PostgreSQL pg_trgm is not available, configuration knobs, and recommended production steps (pg_trgm enablement, indexes, caching, autosuggest and unified search endpoint suggestions).

Primary components

- Service: [src/services/productMatching.service.ts](src/services/productMatching.service.ts)
- Bulk upload integration: [src/services/bulkUpload.service.ts](src/services/bulkUpload.service.ts)
- Product routes/controllers: various controllers call the matching service; see [src/routes/product.routes.ts](src/routes/product.routes.ts)

High-level flow

1. Input normalization
- The consumer (bulk upload or a product-search controller) prepares a search string and normalizes it (lowercasing, trimming, removing punctuation) to create a `normalizedName` used for comparisons.

2. Exact / normalized match
- The service first attempts exact and normalized matches (fast DB queries by equality or indexed fields). If an exact match is found, those are returned immediately with high confidence.

3. pg_trgm similarity (preferred)
- If the DB supports the `pg_trgm` extension, the code attempts a similarity-based query using the SQL `similarity()` function to score candidate rows. Example pattern used in the code:

  SELECT id, name, similarity(COALESCE(p.normalized_name, ''), ${normalizedName}) as similarity
  FROM products p
  WHERE similarity(COALESCE(p.normalized_name, ''), ${normalizedName}) > ${threshold}
  ORDER BY similarity DESC

- The service uses a configurable threshold (env: `FUZZY_MATCH_THRESHOLD`) and will return rows ordered by similarity.

4. Local trigram fallback
- If the pg_trgm query fails (extension missing or query error), the service falls back to a local trigram similarity implementation (`trigramSimilarity()` in the same service) that computes an approximate similarity score in JS. This fallback is significantly slower and supports smaller datasets or environments where you cannot enable pg_trgm.

5. Fuse.js in-memory fuzzy search
- When the service cannot rely on DB trigram scoring for some cases, it uses Fuse.js (configured with tuned keys and distances) to provide in-memory fuzzy results. Fuse.js is used primarily for suggestions and smaller candidate sets.

Where the matching service is used

- Bulk upload: [src/services/bulkUpload.service.ts](src/services/bulkUpload.service.ts) attempts to fuzzy-match incoming category or product names against existing rows. It explicitly tries pg_trgm first and falls back to local fuzzy logic if pg_trgm is unavailable.
- Product matching: [src/services/productMatching.service.ts](src/services/productMatching.service.ts) is written as a general-purpose matching engine and is consumed by controllers/services that need product lookup, product-auto-suggest, or duplicate detection.

Behavior when pg_trgm is missing

- The code is defensive: it catches SQL errors when running `similarity()` and logs the fallback to local fuzzy logic.
- This means the system continues to work, but queries are slower and scoring less reliable.

Configuration knobs

- `FUZZY_MATCH_THRESHOLD` (env): Main similarity threshold for fuzzy product matching. Lower values widen matches; higher values tighten.
- `CATEGORY_FUZZY_THRESHOLD` (env): Threshold used when matching categories during bulk upload.
- Fuse.js options inside `productMatching.service.ts`: distance, minMatchCharLength, keys and weights — tune these for autosuggest vs full fuzzy match.

Performance & production readiness

1. Enable pg_trgm extension (strongly recommended)
- For production-grade fuzzy search you should enable the `pg_trgm` extension on the Postgres instance. This delivers much faster similarity queries and allows index-backed lookups.
- DB command (run as a DB superuser / admin):

  CREATE EXTENSION IF NOT EXISTS pg_trgm;

- Create recommended trigram GIN index on the normalized searchable field (example index):

  CREATE INDEX IF NOT EXISTS idx_products_normalized_name_trgm ON products USING gin (normalized_name gin_trgm_ops);

- Indexing drastically improves similarity query performance for large product catalogs.

2. Migration
- The repo now includes a raw SQL migration that enables `pg_trgm` and creates a trigram GIN index: `prisma/migrations/20260223_enable_pg_trgm/migration.sql`.
- If your environment does not allow creating extensions from the application role, run the SQL as a DB admin or follow your provider's instructions (Neon/RDS/Cloud providers may require specific steps).

You can apply the migration with `psql` or `npx prisma db execute` — see `prisma/migrations/20260223_enable_pg_trgm/README.md` for commands.

3. Caching
- Cache popular query results (Redis) and cache autosuggest entries. The service is good at scoring but for high QPS you should avoid repeating expensive similarity scans.

4. Metrics and observability
- Record metrics for queries that hit the DB trigram path vs local fallback. Track counts, latency, and top queries. Alert on fallback usage — it indicates pg_trgm is not installed or broken.

Suggested unified search API (scaffold)

- Implement a single endpoint (example): `GET /api/search`.
- Query params:
  - `q` (string) — required search text
  - `limit` (int, default 20)
  - `page` (int)
  - `sort` (`score` | `price_asc` | `price_desc` | `availability`)
  - `type` (`autosuggest` | `search`) — `autosuggest` uses Fuse.js for ultra-low-latency prefix/autocomplete results; `search` uses pg_trgm scoring.
  - other filters: `shopId`, `categoryId`, `minPrice`, `maxPrice`
- Response shape (example):
  - `results`: [{ productId, name, price, shopId, availability, score }] — `score` is similarity confidence from 0..1
  - `meta`: { total, page, limit, tookMs }

- Implementation notes:
  - Route handler calls `productMatching.service` to get scored results and then enriches them with price and availability from `products`/`shop_products` tables.
  - For autosuggest, use a dedicated in-memory index (Fuse.js) kept warm/updated by product-change events.

Autosuggest & highlighting

- Autosuggest: keep a lightweight Fuse.js index (or Redis autocomplete) populated from product names and popular phrases. Use for keystroke-by-keystroke suggestions.
- Highlighting: compute highlight spans on the server (simple substring matches) or return matched tokens positions, letting the client highlight tokens. Using the similarity score plus matched fields enables ranked highlighting.

Tuning recommendations

- Start with `FUZZY_MATCH_THRESHOLD=0.8` (repo default guidance) and lower to 0.7 if yields are too sparse.
- For autosuggest, use a shorter minimal match length (2-3 chars) and rely on Fuse.js distance tuning for UX.

Operational checklist for rollout

- Ensure `pg_trgm` is installed and the GIN trigram index exists on `normalized_name`.
- Add the `CREATE EXTENSION` to your DB bootstrap path or a migration for environments that allow it.
- Add a small integration test that asserts the service takes the pg_trgm path (mock DB or run against a test DB with extension enabled).
- Add a cache layer for frequent queries and autosuggest keys (Redis).
- Monitor latencies, top queries, and fallback occurrences.

References in code

- Fuzzy matching implementation and fallback logic: [src/services/productMatching.service.ts](src/services/productMatching.service.ts)
- Bulk upload uses pg_trgm path and logs fallback: [src/services/bulkUpload.service.ts](src/services/bulkUpload.service.ts)
- Consider adding a unified route under: [src/routes/product.routes.ts](src/routes/product.routes.ts)

Appendix: Example SQL snippets

- Enable extension:

  CREATE EXTENSION IF NOT EXISTS pg_trgm;

- Create trigram index:

  CREATE INDEX IF NOT EXISTS idx_products_normalized_name_trgm ON products USING gin (normalized_name gin_trgm_ops);

- Example similarity query used in code (conceptual):

  SELECT p.id, p.name, similarity(p.normalized_name, $1) AS score
  FROM products p
  WHERE similarity(p.normalized_name, $1) > $2
  ORDER BY score DESC
  LIMIT $3;

Questions / next steps I can take

- Add a short SQL migration file (prisma or raw SQL) that executes `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and add a note to `README.md`/docs with steps for Neon/RDS.
- Scaffold a `GET /api/search` endpoint implementation and route (controller + route + service wiring) that returns scored product results and supports autosuggest.

If you want me to implement either the migration or the unified search endpoint (scaffold + tests), tell me which and I'll proceed.