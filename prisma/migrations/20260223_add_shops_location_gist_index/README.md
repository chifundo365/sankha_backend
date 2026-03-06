Create GIST index on `shops.location`

This migration creates a GIST index on the `shops.location` column to accelerate PostGIS spatial queries (ST_DWithin, ST_Distance).

Prerequisites
- PostGIS extension must be installed on the database.
- The `shops.location` column should be a geometry/geometry(Point,4326) or geography type. Adjust the column type if necessary.

Apply

1) With `psql` (superuser / admin):

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260223_add_shops_location_gist_index/migration.sql
```

2) With Prisma (db execute):

```bash
npx prisma db execute --file=prisma/migrations/20260223_add_shops_location_gist_index/migration.sql --schema=prisma/schema.prisma
```

Notes
- Managed DB services (Neon, RDS, etc.) may require special steps or admin privileges to enable PostGIS or to create GIST indexes. Consult your provider docs.
- If `shops.location` is stored as separate `latitude`/`longitude` columns instead of a geometry column, consider adding a geometry column and backfilling it:

```sql
ALTER TABLE shops ADD COLUMN location geography(Point,4326);
UPDATE shops SET location = ST_SetSRID(ST_MakePoint(COALESCE(longitude,0), COALESCE(latitude,0)), 4326)::geography WHERE longitude IS NOT NULL AND latitude IS NOT NULL;
```

- After backfill, run the index creation above.
