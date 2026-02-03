-- ============================================================================
-- BULK UPLOAD v4.0 - STAGING PIPELINE MIGRATION
-- ============================================================================
-- Run this migration to enable the full v4.0 staging features
-- Execute: psql -d your_database -f bulk_upload_v4_staging.sql
-- ============================================================================

-- 1. Add new enum values for listing_status
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'NEEDS_SPECS';
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'BROKEN';

-- 2. Add new enum values for upload_status  
ALTER TYPE upload_status ADD VALUE IF NOT EXISTS 'STAGING';
ALTER TYPE upload_status ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 3. Create template_type enum
DO $$ BEGIN
  CREATE TYPE template_type AS ENUM ('ELECTRONICS', 'GENERAL', 'AUTO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create staging_validation_status enum
DO $$ BEGIN
  CREATE TYPE staging_validation_status AS ENUM ('PENDING', 'VALID', 'INVALID', 'COMMITTED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Add new columns to bulk_uploads table
ALTER TABLE bulk_uploads 
ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS template_type template_type DEFAULT 'AUTO',
ADD COLUMN IF NOT EXISTS needs_specs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS needs_images INT DEFAULT 0;

-- Create index on batch_id
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_batch_id ON bulk_uploads(batch_id);

-- 6. Add variant_values column to shop_products
ALTER TABLE shop_products
ADD COLUMN IF NOT EXISTS variant_values JSONB;

-- 7. Create bulk_upload_staging table
CREATE TABLE IF NOT EXISTS bulk_upload_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch reference
  batch_id VARCHAR(50) NOT NULL,
  bulk_upload_id UUID REFERENCES bulk_uploads(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- Row tracking
  row_number INT NOT NULL,
  
  -- Raw data (preserved exactly as uploaded)
  raw_data JSONB NOT NULL,
  
  -- Parsed/normalized data
  product_name VARCHAR(255),
  normalized_name VARCHAR(255),
  category_name VARCHAR(100),
  brand VARCHAR(100),
  sku VARCHAR(50),
  base_price DECIMAL(12, 2),
  display_price DECIMAL(12, 2),
  stock_quantity INT,
  condition VARCHAR(20),
  description TEXT,
  
  -- Parsed variant values
  variant_values JSONB,
  
  -- Template type detected
  template_type template_type DEFAULT 'GENERAL',
  
  -- Validation results
  validation_status staging_validation_status DEFAULT 'PENDING',
  
  -- Product matching
  matched_product_id UUID,
  will_create_product BOOLEAN DEFAULT false,
  
  -- Spec validation results
  missing_specs JSONB,
  
  -- Error details
  errors JSONB,
  
  -- Determined listing status (if committed)
  target_listing_status listing_status,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Create indexes for staging table
CREATE INDEX IF NOT EXISTS idx_staging_batch_id ON bulk_upload_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_shop_batch ON bulk_upload_staging(shop_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_validation_status ON bulk_upload_staging(validation_status);
CREATE INDEX IF NOT EXISTS idx_staging_bulk_upload_id ON bulk_upload_staging(bulk_upload_id);

-- 8. Create tech_spec_rules table for category-aware validation
CREATE TABLE IF NOT EXISTS tech_spec_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Category reference
  category_id UUID UNIQUE REFERENCES categories(id),
  category_name VARCHAR(100) NOT NULL,
  
  -- Required specs (must have for LIVE status)
  required_specs JSONB NOT NULL DEFAULT '[]',
  
  -- Optional specs (nice to have)
  optional_specs JSONB DEFAULT '[]',
  
  -- Spec labels (human-readable names)
  spec_labels JSONB DEFAULT '{}',
  
  -- Spec validation rules
  spec_validations JSONB,
  
  -- Is this category active for spec enforcement?
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tech_spec_rules_category ON tech_spec_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_tech_spec_rules_name ON tech_spec_rules(category_name);

-- 9. Add governance flag to shops
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS can_bulk_upload BOOLEAN DEFAULT true;

-- 10. Insert default tech spec rules for common categories
INSERT INTO tech_spec_rules (category_name, required_specs, optional_specs, spec_labels)
VALUES 
  ('Smartphones', '["ram", "storage", "screen_size"]', '["color", "battery", "camera", "warranty"]', 
   '{"ram": "RAM", "storage": "Storage", "screen_size": "Screen Size", "battery": "Battery", "camera": "Camera"}'),
  ('Laptops', '["ram", "storage", "processor", "screen_size"]', '["color", "graphics", "os", "warranty"]',
   '{"ram": "RAM", "storage": "Storage", "processor": "Processor", "screen_size": "Screen Size", "graphics": "Graphics Card"}'),
  ('Tablets', '["ram", "storage", "screen_size"]', '["color", "battery", "warranty"]',
   '{"ram": "RAM", "storage": "Storage", "screen_size": "Screen Size"}'),
  ('TVs', '["screen_size", "resolution"]', '["smart_tv", "refresh_rate", "warranty", "hdr"]',
   '{"screen_size": "Screen Size", "resolution": "Resolution", "smart_tv": "Smart TV", "refresh_rate": "Refresh Rate"}')
ON CONFLICT (category_name) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bulk_upload_staging';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bulk_uploads' AND column_name IN ('batch_id', 'template_type');
-- SELECT * FROM tech_spec_rules;
