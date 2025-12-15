-- Migration: Add trigger to automatically log stock changes
-- This ensures ALL stock changes are logged regardless of source
-- (API, background jobs, payment webhooks, etc.)

-- ============================================================================
-- STOCK CHANGE LOGGING TRIGGER
-- ============================================================================
-- 
-- This trigger automatically logs stock quantity changes to shop_products_log.
-- Applications can optionally set a custom reason using session variables:
-- 
--   SET LOCAL app.stock_change_reason = 'Order ORD-2025-000001 checkout';
--   UPDATE shop_products SET stock_quantity = stock_quantity - 1 WHERE id = '...';
--   RESET app.stock_change_reason;
--
-- If no custom reason is set, a default reason is generated.
-- ============================================================================

-- Create function to log stock changes
CREATE OR REPLACE FUNCTION log_stock_change()
RETURNS TRIGGER AS $$
DECLARE
    change_amount INTEGER;
    change_direction stock_change_type;
    change_reason TEXT;
    custom_reason TEXT;
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
        
        -- Try to get custom reason from session variable
        -- Applications can set this before updating stock
        BEGIN
            custom_reason := current_setting('app.stock_change_reason', true);
        EXCEPTION WHEN OTHERS THEN
            custom_reason := NULL;
        END;
        
        -- Use custom reason if provided, otherwise generate default
        IF custom_reason IS NOT NULL AND custom_reason != '' THEN
            change_reason := custom_reason;
        ELSE
            change_reason := 'Stock ' || 
                CASE WHEN change_direction = 'INCREASE' THEN 'increased' ELSE 'decreased' END ||
                ' from ' || OLD.stock_quantity || ' to ' || NEW.stock_quantity;
        END IF;
        
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

-- ============================================================================
-- INITIAL STOCK LOGGING (for new products)
-- ============================================================================
-- This trigger logs when a new shop_product is created with initial stock

CREATE OR REPLACE FUNCTION log_initial_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if initial stock is greater than 0
    IF NEW.stock_quantity > 0 THEN
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
            NEW.stock_quantity,
            'INCREASE',
            'Initial stock - Product added to shop',
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new shop products
DROP TRIGGER IF EXISTS initial_stock_trigger ON shop_products;

CREATE TRIGGER initial_stock_trigger
    AFTER INSERT ON shop_products
    FOR EACH ROW
    EXECUTE FUNCTION log_initial_stock();

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION log_stock_change() IS 
'Automatically logs stock quantity changes to shop_products_log table. 
Supports custom reasons via session variable: SET LOCAL app.stock_change_reason = ''reason'';';

COMMENT ON TRIGGER stock_change_trigger ON shop_products IS 
'Ensures all stock changes are logged for audit purposes, regardless of source (API, jobs, webhooks, etc.).';

COMMENT ON FUNCTION log_initial_stock() IS 
'Logs initial stock when a new shop_product is created.';

COMMENT ON TRIGGER initial_stock_trigger ON shop_products IS 
'Creates initial stock log entry when products are added to a shop.';
