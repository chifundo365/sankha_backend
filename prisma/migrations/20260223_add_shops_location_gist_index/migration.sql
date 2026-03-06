-- Migration: Create GIST index on shops.location to accelerate PostGIS spatial queries
-- Ensure PostGIS is installed on the target database before applying.

CREATE INDEX IF NOT EXISTS idx_shops_location_gist ON shops USING GIST (location);
