-- ------------------------------
-- CORE MVP TABLES (10 tables) - DrawSQL Compatible
-- ------------------------------

-- 1. Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'USER',
    profile_image TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP
);

-- 2. User addresses
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) DEFAULT 'Malawi',
    is_default BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. Shops
CREATE TABLE shops (
    id UUID PRIMARY KEY,
    owner_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    delivery_enabled BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- 5. Products
CREATE TABLE products (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    description TEXT,
    category_id UUID,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 6. Shop Products (Inventory)
CREATE TABLE shop_products (
    id UUID PRIMARY KEY,
    shop_id UUID NOT NULL,
    product_id UUID NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    condition VARCHAR(20) DEFAULT 'NEW',
    is_available BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (shop_id) REFERENCES shops(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 7. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    buyer_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    delivery_address_id UUID,
    created_at TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (shop_id) REFERENCES shops(id),
    FOREIGN KEY (delivery_address_id) REFERENCES user_addresses(id)
);

-- 8. Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    shop_product_id UUID,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (shop_product_id) REFERENCES shop_products(id)
);

-- 9. Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    transaction_id VARCHAR(255),
    customer_phone VARCHAR(20),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 10. Reviews (SIMPLIFIED - This should import now)
CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    reviewer_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    product_id UUID NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (shop_id) REFERENCES shops(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);