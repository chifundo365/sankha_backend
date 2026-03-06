-- Migration: Add geography column `location` to `shops`, backfill from latitude/longitude, and create GIST index.
-- This migration is defensive: it creates PostGIS extension if possible, adds the column only if missing,
-- backfills existing latitude/longitude values, and creates the GIST index if the column exists.

BEGIN;

-- 1) Ensure PostGIS extension exists (will be a no-op if already installed).
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2) Add `location` geography column if it does not exist.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS location geography(Point,4326);

-- 3) Backfill `location` from `longitude` and `latitude` when those columns are present and not null.
-- Use COALESCE only to avoid NULL arguments, but we only update rows where both lat & lng are present.
UPDATE shops
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND (location IS NULL);

-- 4) Create GIST index to accelerate spatial queries.
CREATE INDEX IF NOT EXISTS idx_shops_location_gist ON shops USING GIST (location);

COMMIT;
