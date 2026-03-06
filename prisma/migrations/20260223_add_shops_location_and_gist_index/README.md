Add `location` geography column to `shops`, backfill from lat/lng, and create GIST index

What this migration does

1. Installs the `postgis` extension if it's not already present (requires permission on managed DBs).
2. Adds a `location` column of type `geography(Point,4326)` to the `shops` table (if missing).
3. Backfills `location` using existing `longitude` and `latitude` columns for rows where both are present.
4. Creates a GIST index `idx_shops_location_gist` on `shops.location` to speed up `ST_DWithin`/`ST_Distance` queries.

Run instructions

Use one of the following (choose depending on your environment and privileges):

1) Using psql (DB admin / superuser):

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260223_add_shops_location_and_gist_index/migration.sql
```

2) Using Prisma (`db execute`):

```bash
npx prisma db execute --file=prisma/migrations/20260223_add_shops_location_and_gist_index/migration.sql --schema=prisma/schema.prisma
```

Notes & caveats

- Many managed PG providers (Neon, RDS, etc.) require special privileges to install PostGIS or create extensions. If you get permission errors when creating the extension, ask your DB admin or use your provider's extension management UI.
- If `shops` currently stores `latitude` and `longitude` as strings or in different columns, adapt the `UPDATE` query accordingly.
- After running, verify:
  - `SELECT PostGIS_Full_Version();` returns version info
  - `SELECT count(*) FROM shops WHERE location IS NOT NULL;` shows rows backfilled
  - `
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'shops';
    ` shows the created `idx_shops_location_gist` index

If you prefer I also add a small Prisma migration file (DDL) rather than raw SQL, tell me which approach your CI/migrate pipeline expects and I will scaffold it.