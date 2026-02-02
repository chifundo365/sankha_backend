-- ============================================================================
-- BULK UPLOAD v4.0 - DATABASE MIGRATION
-- Run this migration to add v4.0 features
-- ============================================================================

-- 1. Add new columns to products (Base Product)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS specs_template JSONB,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

COMMENT ON COLUMN products.specs_template IS 
'Template defining required/optional specs for this product type. Example: {"ram": "required", "storage": "required", "color": "optional"}';

COMMENT ON COLUMN products.is_verified IS 
'Whether this base product has been verified by admin for accuracy';

-- Create index for verified products (prioritized in matching)
CREATE INDEX IF NOT EXISTS idx_products_is_verified ON products(is_verified) WHERE is_verified = true;

-- 2. Add new columns to shop_products
ALTER TABLE shop_products 
ADD COLUMN IF NOT EXISTS variant_values JSONB,
ADD COLUMN IF NOT EXISTS error_reason TEXT;

-- Migrate existing specs to variant_values if not already done
UPDATE shop_products 
SET variant_values = specs 
WHERE specs IS NOT NULL AND variant_values IS NULL;

COMMENT ON COLUMN shop_products.variant_values IS 
'Structured variant/spec values. Example: {"ram": "8GB", "storage": "256GB"}';

COMMENT ON COLUMN shop_products.error_reason IS 
'Why this listing has BROKEN/invalid status';

-- Create GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_shop_products_variant_values 
ON shop_products USING GIN (variant_values);

-- 3. Update listing_status enum - add new values
DO $$ 
BEGIN
    -- Add NEEDS_SPECS if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'NEEDS_SPECS' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'listing_status')
    ) THEN
        ALTER TYPE listing_status ADD VALUE 'NEEDS_SPECS';
    END IF;
    
    -- Add BROKEN if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'BROKEN' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'listing_status')
    ) THEN
        ALTER TYPE listing_status ADD VALUE 'BROKEN';
    END IF;
END $$;

-- 4. Add governance column to shops
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS can_bulk_upload BOOLEAN DEFAULT true;

COMMENT ON COLUMN shops.can_bulk_upload IS 
'Admin can set to false to prevent shop from using bulk upload';

-- 5. Update bulk_uploads table with v4 fields
ALTER TABLE bulk_uploads 
ADD COLUMN IF NOT EXISTS needs_specs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS needs_images INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS template_type VARCHAR(20) DEFAULT 'GENERAL';

-- Add index for batch_id
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_batch_id ON bulk_uploads(batch_id);

-- 6. Update upload_status enum - add STAGING
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'STAGING' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'upload_status')
    ) THEN
        ALTER TYPE upload_status ADD VALUE 'STAGING' BEFORE 'PROCESSING';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'CANCELLED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'upload_status')
    ) THEN
        ALTER TYPE upload_status ADD VALUE 'CANCELLED';
    END IF;
END $$;

-- 7. Create staging table for bulk uploads
CREATE TABLE IF NOT EXISTS bulk_upload_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(50) NOT NULL,
    bulk_upload_id UUID REFERENCES bulk_uploads(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    row_number INT NOT NULL,
    
    -- Raw data preserved exactly as uploaded
    raw_data JSONB NOT NULL,
    
    -- Parsed/normalized data
    product_name VARCHAR(255),
    normalized_name VARCHAR(255),
    category_name VARCHAR(100),
    brand VARCHAR(100),
    sku VARCHAR(50),
    base_price DECIMAL(12,2),
    display_price DECIMAL(12,2),
    stock_quantity INT,
    condition VARCHAR(20),
    description TEXT,
    
    -- Parsed variant values
    variant_values JSONB,
    
    -- Template type detected
    template_type VARCHAR(20) DEFAULT 'GENERAL',
    
    -- Validation results
    validation_status VARCHAR(20) DEFAULT 'PENDING',
    
    -- Product matching results
    matched_product_id UUID,
    will_create_product BOOLEAN DEFAULT false,
    
    -- Spec validation results
    missing_specs JSONB,
    
    -- Error details
    errors JSONB,
    
    -- Target listing status if committed
    target_listing_status VARCHAR(30),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Staging table indexes
CREATE INDEX IF NOT EXISTS idx_staging_batch ON bulk_upload_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_shop_batch ON bulk_upload_staging(shop_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_status ON bulk_upload_staging(validation_status);

COMMENT ON TABLE bulk_upload_staging IS 
'Temporary staging table for bulk uploads before commit to production';

-- 8. Create tech spec rules table
CREATE TABLE IF NOT EXISTS tech_spec_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID UNIQUE REFERENCES categories(id),
    category_name VARCHAR(100) NOT NULL,
    required_specs JSONB NOT NULL DEFAULT '[]',
    optional_specs JSONB DEFAULT '[]',
    spec_labels JSONB DEFAULT '{}',
    spec_validations JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tech_spec_rules IS 
'Defines required/optional specs for tech product categories';

-- 9. Seed tech spec rules for common categories
INSERT INTO tech_spec_rules (category_id, category_name, required_specs, optional_specs, spec_labels)
SELECT 
    id,
    name,
    CASE 
        WHEN LOWER(name) LIKE '%smartphone%' OR LOWER(name) LIKE '%phone%' THEN '["ram", "storage", "screen_size"]'::jsonb
        WHEN LOWER(name) LIKE '%laptop%' OR LOWER(name) LIKE '%notebook%' THEN '["ram", "storage", "processor", "screen_size"]'::jsonb
        WHEN LOWER(name) LIKE '%tablet%' OR LOWER(name) LIKE '%ipad%' THEN '["ram", "storage", "screen_size"]'::jsonb
        WHEN LOWER(name) LIKE '%tv%' OR LOWER(name) LIKE '%television%' THEN '["screen_size", "resolution"]'::jsonb
        WHEN LOWER(name) LIKE '%camera%' THEN '["megapixels"]'::jsonb
        ELSE '[]'::jsonb
    END,
    CASE 
        WHEN LOWER(name) IN ('smartphones', 'laptops', 'tablets') THEN '["color", "warranty", "weight"]'::jsonb
        ELSE '["color", "warranty"]'::jsonb
    END,
    CASE 
        WHEN LOWER(name) LIKE '%smartphone%' OR LOWER(name) LIKE '%phone%' THEN '{"ram": "RAM", "storage": "Storage", "screen_size": "Screen Size"}'::jsonb
        WHEN LOWER(name) LIKE '%laptop%' THEN '{"ram": "RAM", "storage": "Storage", "processor": "Processor", "screen_size": "Screen Size"}'::jsonb
        ELSE '{}'::jsonb
    END
FROM categories
WHERE LOWER(name) SIMILAR TO '%(smartphone|phone|laptop|notebook|tablet|ipad|tv|television|camera)%'
ON CONFLICT (category_id) DO NOTHING;

-- 10. Create additional GIN index for products specs_template
CREATE INDEX IF NOT EXISTS idx_products_specs_template 
ON products USING GIN (specs_template);

-- Done!
SELECT 'Bulk Upload v4.0 migration completed successfully' AS status;
