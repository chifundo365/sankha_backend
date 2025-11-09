-- ========================-- CreateEnum

-- ENUM DEFINITIONSCREATE TYPE "address_type" AS ENUM ('HOME', 'WORK', 'BILLING', 'PICKUP_POINT');

-- ========================

CREATE TYPE "address_type" AS ENUM ('HOME', 'WORK', 'BILLING', 'PICKUP_POINT');-- CreateEnum

CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');

CREATE TYPE "message_channel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED');-- CreateEnum

CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');CREATE TYPE "message_channel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

CREATE TYPE "payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TYPE "product_condition" AS ENUM ('NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR');-- CreateEnum

CREATE TYPE "recipient_type" AS ENUM ('CUSTOMER', 'SHOP');CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED');

CREATE TYPE "user_role" AS ENUM ('USER', 'SELLER', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE "stock_change_type" AS ENUM ('INCREASE', 'DECREASE', 'ADJUSTMENT');-- CreateEnum

CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- ========================

-- USERS-- CreateEnum

-- ========================CREATE TYPE "payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "users" (

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),-- CreateEnum

    "full_name" VARCHAR(150) NOT NULL,CREATE TYPE "product_condition" AS ENUM ('NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR');

    "email" VARCHAR(255) NOT NULL,

    "phone_number" VARCHAR(20),-- CreateEnum

    "password_hash" VARCHAR(255) NOT NULL,CREATE TYPE "recipient_type" AS ENUM ('CUSTOMER', 'SHOP');

    "role" "user_role" NOT NULL DEFAULT 'USER',

    "profile_image" TEXT,-- CreateEnum

    "is_active" BOOLEAN DEFAULT true,CREATE TYPE "user_role" AS ENUM ('USER', 'SELLER', 'ADMIN', 'SUPER_ADMIN');

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,-- CreateTable

CREATE TABLE "order_items" (

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

);    "order_id" UUID NOT NULL,

    "shop_product_id" UUID,

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");    "product_name" VARCHAR(255) NOT NULL,

CREATE INDEX "idx_users_email" ON "users"("email");    "quantity" INTEGER NOT NULL,

    "unit_price" DECIMAL(10,2) NOT NULL,

-- ========================    "total_price" DECIMAL(10,2),

-- SHOPS

-- ========================    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")

CREATE TABLE "shops" ();

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "owner_id" UUID,-- CreateTable

    "name" VARCHAR(255) NOT NULL,CREATE TABLE "orders" (

    "description" TEXT,    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "business_registration_no" VARCHAR(100),    "order_number" VARCHAR(50) NOT NULL,

    "address_line1" VARCHAR(255),    "buyer_id" UUID NOT NULL,

    "city" VARCHAR(100),    "shop_id" UUID NOT NULL,

    "latitude" DECIMAL(10,6),    "total_amount" DECIMAL(10,2) NOT NULL,

    "longitude" DECIMAL(10,6),    "status" VARCHAR(30) DEFAULT 'PENDING',

    "phone" VARCHAR(20),    "delivery_address_id" UUID,

    "email" VARCHAR(255),    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "is_verified" BOOLEAN DEFAULT false,    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "delivery_enabled" BOOLEAN DEFAULT true,

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")

    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,);



    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")-- CreateTable

);CREATE TABLE "payments" (

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

-- ========================    "order_id" UUID NOT NULL,

-- CATEGORIES    "payment_method" VARCHAR(50) NOT NULL,

-- ========================    "provider" VARCHAR(100),

CREATE TABLE "categories" (    "amount" DECIMAL(10,2) NOT NULL,

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "status" VARCHAR(30) DEFAULT 'PENDING',

    "name" VARCHAR(100) NOT NULL,    "transaction_id" VARCHAR(255),

    "description" TEXT,    "payment_reference" VARCHAR(255),

    "is_active" BOOLEAN DEFAULT true,    "customer_phone" VARCHAR(20),

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    "raw_response" JSONB,

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")

);    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")

);

CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateTable

-- ========================CREATE TABLE "products" (

-- PRODUCTS (base catalog)    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

-- ========================    "name" VARCHAR(255) NOT NULL,

CREATE TABLE "products" (    "brand" VARCHAR(100),

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "description" TEXT,

    "name" VARCHAR(255) NOT NULL,    "category_id" UUID,

    "brand" VARCHAR(100),    "base_price" DECIMAL(10,2),

    "description" TEXT,    "images" TEXT[],

    "category_id" UUID,    "is_active" BOOLEAN DEFAULT true,

    "base_price" DECIMAL(10,2),    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "images" TEXT[],    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "is_active" BOOLEAN DEFAULT true,

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    CONSTRAINT "products_pkey" PRIMARY KEY ("id")

    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,);



    CONSTRAINT "products_pkey" PRIMARY KEY ("id")-- CreateTable

);CREATE TABLE "shops" (

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

CREATE INDEX "idx_products_name" ON "products"("name");    "owner_id" UUID,

    "name" VARCHAR(255) NOT NULL,

-- ========================    "description" TEXT,

-- SHOP_PRODUCTS (availability)    "business_registration_no" VARCHAR(100),

-- ========================    "address_line1" VARCHAR(255),

CREATE TABLE "shop_products" (    "city" VARCHAR(100),

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "latitude" DECIMAL(10,6),

    "shop_id" UUID NOT NULL,    "longitude" DECIMAL(10,6),

    "product_id" UUID NOT NULL,    "phone" VARCHAR(20),

    "sku" VARCHAR(50),    "email" VARCHAR(255),

    "price" DECIMAL(10,2) NOT NULL,    "is_verified" BOOLEAN DEFAULT false,

    "stock_quantity" INTEGER NOT NULL,    "delivery_enabled" BOOLEAN DEFAULT true,

    "condition" "product_condition" DEFAULT 'NEW',    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "specs" JSONB,    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "images" TEXT[],

    "is_available" BOOLEAN DEFAULT true,    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,);

    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

-- CreateTable

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id"),CREATE TABLE "user_addresses" (

    CONSTRAINT "shop_products_price_check" CHECK ("price" >= 0),    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "shop_products_stock_quantity_check" CHECK ("stock_quantity" >= 0)    "user_id" UUID NOT NULL,

);    "contact_name" VARCHAR(255) NOT NULL,

    "address_line1" VARCHAR(255) NOT NULL,

CREATE INDEX "idx_shop_products_shop_id" ON "shop_products"("shop_id");    "city" VARCHAR(100) NOT NULL,

    "country" VARCHAR(100) DEFAULT 'Malawi',

-- ========================    "latitude" DECIMAL(10,6),

-- SHOP_PRODUCTS_LOG (inventory history)    "longitude" DECIMAL(10,6),

-- ========================    "is_default" BOOLEAN DEFAULT false,

CREATE TABLE "shop_products_log" (    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "shop_product_id" UUID NOT NULL,    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")

    "change_qty" INTEGER NOT NULL,);

    "change_type" "stock_change_type" NOT NULL,

    "reason" VARCHAR(100),-- CreateTable

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,CREATE TABLE "users" (

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "shop_products_log_pkey" PRIMARY KEY ("id")    "full_name" VARCHAR(150) NOT NULL,

);    "email" VARCHAR(255) NOT NULL,

    "phone_number" VARCHAR(20),

-- ========================    "password_hash" VARCHAR(255) NOT NULL,

-- USER_ADDRESSES    "role" VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',

-- ========================    "profile_image" TEXT,

CREATE TABLE "user_addresses" (    "is_active" BOOLEAN NOT NULL DEFAULT true,

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "user_id" UUID NOT NULL,    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "contact_name" VARCHAR(255) NOT NULL,

    "address_line1" VARCHAR(255) NOT NULL,    CONSTRAINT "users_pkey" PRIMARY KEY ("id")

    "city" VARCHAR(100) NOT NULL,);

    "country" VARCHAR(100) DEFAULT 'Malawi',

    "latitude" DECIMAL(10,6),-- CreateTable

    "longitude" DECIMAL(10,6),CREATE TABLE "categories" (

    "is_default" BOOLEAN DEFAULT false,    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    "name" VARCHAR(100) NOT NULL,

    "description" TEXT,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")    "is_active" BOOLEAN DEFAULT true,

);    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,



-- ========================    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")

-- ORDERS);

-- ========================

CREATE TABLE "orders" (-- CreateTable

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),CREATE TABLE "order_messages" (

    "order_number" VARCHAR(50) NOT NULL,    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "buyer_id" UUID NOT NULL,    "order_id" UUID NOT NULL,

    "shop_id" UUID NOT NULL,    "recipient_type" VARCHAR(20) NOT NULL,

    "total_amount" DECIMAL(10,2) NOT NULL,    "message_type" VARCHAR(50) NOT NULL,

    "status" "order_status" DEFAULT 'PENDING',    "subject" VARCHAR(255),

    "delivery_address_id" UUID,    "body" TEXT NOT NULL,

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    "is_sent" BOOLEAN DEFAULT false,

    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    "sent_at" TIMESTAMP(6),

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "orders_total_amount_check" CHECK ("total_amount" >= 0)    CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id")

););



CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");-- CreateTable

CREATE INDEX "idx_orders_buyer_id" ON "orders"("buyer_id");CREATE TABLE "reviews" (

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

-- ========================    "order_id" UUID,

-- ORDER_ITEMS    "reviewer_id" UUID NOT NULL,

-- ========================    "shop_id" UUID NOT NULL,

CREATE TABLE "order_items" (    "product_id" UUID NOT NULL,

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "rating" INTEGER,

    "order_id" UUID NOT NULL,    "comment" TEXT,

    "shop_product_id" UUID,    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "product_name" VARCHAR(255) NOT NULL,

    "quantity" INTEGER NOT NULL,    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")

    "unit_price" DECIMAL(10,2) NOT NULL,);

    "total_price" DECIMAL(10,2) GENERATED ALWAYS AS ("quantity" * "unit_price") STORED,

-- CreateTable

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),CREATE TABLE "shop_products" (

    CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "order_items_unit_price_check" CHECK ("unit_price" >= 0)    "shop_id" UUID NOT NULL,

);    "product_id" UUID NOT NULL,

    "price" DECIMAL(10,2) NOT NULL,

-- ========================    "stock_quantity" INTEGER NOT NULL,

-- PAYMENTS    "condition" VARCHAR(20) DEFAULT 'NEW',

-- ========================    "specs" JSONB,

CREATE TABLE "payments" (    "images" TEXT[],

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),    "is_available" BOOLEAN DEFAULT true,

    "order_id" UUID NOT NULL,    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "payment_method" VARCHAR(50) NOT NULL,    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    "provider" VARCHAR(100),

    "amount" DECIMAL(10,2) NOT NULL,    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")

    "status" "payment_status" DEFAULT 'PENDING',);

    "transaction_id" VARCHAR(255),

    "payment_reference" VARCHAR(255),-- CreateTable

    "customer_phone" VARCHAR(20),CREATE TABLE "shop_products_log" (

    "raw_response" JSONB,    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,    "shop_product_id" UUID NOT NULL,

    "change_qty" INTEGER NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),    "change_type" VARCHAR(50) NOT NULL,

    CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0)    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

);

    CONSTRAINT "shop_products_log_pkey" PRIMARY KEY ("id")

CREATE INDEX "idx_payments_order_id" ON "payments"("order_id"););



-- ========================-- CreateIndex

-- ORDER_MESSAGESCREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- ========================

CREATE TABLE "order_messages" (-- CreateIndex

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),CREATE INDEX "idx_orders_buyer_id" ON "orders"("buyer_id");

    "order_id" UUID NOT NULL,

    "recipient_type" "recipient_type" NOT NULL,-- CreateIndex

    "message_type" VARCHAR(50) NOT NULL,CREATE INDEX "idx_payments_order_id" ON "payments"("order_id");

    "subject" VARCHAR(255),

    "body" TEXT NOT NULL,-- CreateIndex

    "channel" "message_channel" DEFAULT 'EMAIL',CREATE INDEX "idx_products_name" ON "products"("name");

    "is_sent" BOOLEAN DEFAULT false,

    "sent_at" TIMESTAMP(6),-- CreateIndex

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,CREATE UNIQUE INDEX "users_email_key" ON "users"("email");



    CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id")-- CreateIndex

);CREATE INDEX "idx_users_email" ON "users"("email");



-- ========================-- CreateIndex

-- REVIEWSCREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- ========================

CREATE TABLE "reviews" (-- CreateIndex

    "id" UUID NOT NULL DEFAULT gen_random_uuid(),CREATE INDEX "idx_shop_products_shop_id" ON "shop_products"("shop_id");

    "order_id" UUID,

    "reviewer_id" UUID NOT NULL,-- AddForeignKey

    "shop_id" UUID NOT NULL,ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    "product_id" UUID NOT NULL,

    "rating" INTEGER,-- AddForeignKey

    "comment" TEXT,ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

-- AddForeignKey

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CONSTRAINT "reviews_rating_check" CHECK (("rating" >= 1) AND ("rating" <= 5))

);-- AddForeignKey

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ========================

-- FOREIGN KEYS-- AddForeignKey

-- ========================ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;



ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;



ALTER TABLE "shop_products_log" ADD CONSTRAINT "shop_products_log_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;



ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;-- AddForeignKey

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ========================

-- TRIGGERS & FUNCTIONS-- AddForeignKey

-- ========================ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE OR REPLACE FUNCTION update_updated_at_column()

RETURNS TRIGGER AS $$-- AddForeignKey

BEGINALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

  NEW.updated_at = NOW();

  RETURN NEW;-- AddForeignKey

END;ALTER TABLE "shop_products_log" ADD CONSTRAINT "shop_products_log_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_timestamp
BEFORE UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_update_timestamp_shop_products
BEFORE UPDATE ON "shop_products"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_update_timestamp_orders
BEFORE UPDATE ON "orders"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
