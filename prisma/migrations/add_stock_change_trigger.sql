-- Migration: Add trigger to automatically log stock changes
-- This ensures ALL stock changes are logged regardless of source
-- (API, background jobs, payment webhooks, etc.)

-- Create function to log stock changes
CREATE OR REPLACE FUNCTION log_stock_change()
RETURNS TRIGGER AS $$
DECLARE
    change_amount INTEGER;
    change_direction stock_change_type;
    change_reason TEXT;
BEGIN
    -- Only proceed if stock_quantity actually changed
    IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
        
        change_amount := ABS(NEW.stock_quantity - OLD.stock_quantity);
        
        -- Determine change type
        IF NEW.stock_quantity > OLD.stock_quantity THEN
            change_direction := 'INCREASE';
        ELSE
            change_direction := 'DECREASE';
        END IF;
        
        -- Default reason (can be overridden by application)
        change_reason := 'Stock quantity changed from ' || OLD.stock_quantity || ' to ' || NEW.stock_quantity;
        
        -- Insert log entry
        INSERT INTO shop_products_log (
            id,
            shop_product_id,
            change_qty,
            change_type,
            reason,
            created_at
        ) VALUES (
            gen_random_uuid(),
            NEW.id,
            change_amount,
            change_direction,
            change_reason,
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on shop_products table
DROP TRIGGER IF EXISTS stock_change_trigger ON shop_products;

CREATE TRIGGER stock_change_trigger
    AFTER UPDATE ON shop_products
    FOR EACH ROW
    EXECUTE FUNCTION log_stock_change();

-- Add comment for documentation
COMMENT ON FUNCTION log_stock_change() IS 
'Automatically logs stock quantity changes to shop_products_log table. Triggered on any UPDATE to shop_products.';

COMMENT ON TRIGGER stock_change_trigger ON shop_products IS 
'Ensures all stock changes are logged for audit purposes, regardless of source (API, jobs, webhooks, etc.).';
