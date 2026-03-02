-- Drop everything in shadow db before baseline replay
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO PUBLIC;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."address_type" AS ENUM ('HOME', 'WORK', 'BILLING', 'PICKUP_POINT');

-- CreateEnum
CREATE TYPE "public"."delivery_method" AS ENUM ('HOME_DELIVERY', 'DEPOT_COLLECTION');

-- CreateEnum
CREATE TYPE "public"."delivery_status" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."listing_status" AS ENUM ('NEEDS_IMAGES', 'PENDING_REVIEW', 'LIVE', 'REJECTED', 'PAUSED', 'NEEDS_SPECS', 'BROKEN');

-- CreateEnum
CREATE TYPE "public"."message_channel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "public"."order_status" AS ENUM ('CART', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "public"."payment_status" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."payment_verified_by" AS ENUM ('VERIFY_ENDPOINT', 'WEBHOOK', 'BACKGROUND_JOB');

-- CreateEnum
CREATE TYPE "public"."payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."product_condition" AS ENUM ('NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR');

-- CreateEnum
CREATE TYPE "public"."product_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "public"."recipient_type" AS ENUM ('CUSTOMER', 'SHOP');

-- CreateEnum
CREATE TYPE "public"."release_code_status" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."staging_validation_status" AS ENUM ('PENDING', 'VALID', 'INVALID', 'COMMITTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."stock_change_type" AS ENUM ('INCREASE', 'DECREASE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."template_type" AS ENUM ('ELECTRONICS', 'GENERAL', 'AUTO');

-- CreateEnum
CREATE TYPE "public"."transaction_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."transaction_type" AS ENUM ('ORDER_CREDIT', 'PAYOUT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."upload_status" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'STAGING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."user_role" AS ENUM ('USER', 'SELLER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."withdrawal_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."bulk_upload_staging" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" VARCHAR(50) NOT NULL,
    "bulk_upload_id" UUID,
    "shop_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "product_name" VARCHAR(255),
    "normalized_name" VARCHAR(255),
    "category_name" VARCHAR(100),
    "brand" VARCHAR(100),
    "sku" VARCHAR(50),
    "base_price" DECIMAL(12,2),
    "display_price" DECIMAL(12,2),
    "stock_quantity" INTEGER,
    "condition" VARCHAR(20),
    "description" TEXT,
    "variant_values" JSONB,
    "template_type" "public"."template_type" NOT NULL DEFAULT 'GENERAL',
    "validation_status" "public"."staging_validation_status" NOT NULL DEFAULT 'PENDING',
    "matched_product_id" UUID,
    "will_create_product" BOOLEAN NOT NULL DEFAULT false,
    "missing_specs" JSONB,
    "errors" JSONB,
    "target_listing_status" "public"."listing_status",
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),

    CONSTRAINT "bulk_upload_staging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bulk_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "status" "public"."upload_status" NOT NULL DEFAULT 'PROCESSING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),
    "batch_id" VARCHAR(50),
    "needs_images" INTEGER NOT NULL DEFAULT 0,
    "needs_specs" INTEGER NOT NULL DEFAULT 0,
    "template_type" "public"."template_type",

    CONSTRAINT "bulk_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "auto_created" BOOLEAN DEFAULT false,
    "created_by" UUID,
    "needs_review" BOOLEAN DEFAULT false,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "shop_product_id" UUID,
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2),
    "base_price" DECIMAL(10,2),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "recipient_type" "public"."recipient_type" NOT NULL,
    "message_type" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "channel" "public"."message_channel" DEFAULT 'EMAIL',
    "is_sent" BOOLEAN DEFAULT false,
    "sent_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" VARCHAR(50) NOT NULL,
    "buyer_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "status" "public"."order_status" DEFAULT 'PENDING',
    "delivery_address_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "release_code" VARCHAR(10),
    "release_code_expires_at" TIMESTAMP(6),
    "release_code_status" "public"."release_code_status" DEFAULT 'PENDING',
    "release_code_verified_at" TIMESTAMP(6),
    "delivery_directions" TEXT,
    "delivery_lat" DECIMAL(10,6),
    "delivery_lng" DECIMAL(10,6),
    "recipient_name" VARCHAR(255),
    "recipient_phone" VARCHAR(20),
    "delivery_fee" DECIMAL(10,2),
    "delivery_method" "public"."delivery_method" DEFAULT 'HOME_DELIVERY',
    "delivery_update_token" VARCHAR(255),
    "depot_lat" DECIMAL(10,6),
    "depot_lng" DECIMAL(10,6),
    "depot_name" VARCHAR(255),
    "destination_name" VARCHAR(255),
    "package_label_text" VARCHAR(255),
    "preferred_carrier_details" TEXT,
    "waybill_number" VARCHAR(100),
    "waybill_photo_url" VARCHAR(1000),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "tx_ref" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID,
    "payment_method" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(100) DEFAULT 'paychangu',
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "public"."payment_status" DEFAULT 'PENDING',
    "transaction_id" VARCHAR(255),
    "payment_reference" VARCHAR(255),
    "customer_phone" VARCHAR(20),
    "raw_response" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "authorization" JSONB,
    "checkout_url" TEXT,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MWK',
    "customer_email" VARCHAR(255),
    "customer_first_name" VARCHAR(100),
    "customer_last_name" VARCHAR(100),
    "email_sent" JSONB DEFAULT '{}',
    "expired_at" TIMESTAMP(6),
    "metadata" JSONB,
    "tx_ref" VARCHAR(255),
    "verified_at" TIMESTAMP(6),
    "verified_by" "public"."payment_verified_by",

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(100),
    "description" TEXT,
    "category_id" UUID,
    "base_price" DECIMAL(10,2),
    "images" TEXT[],
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "aliases" TEXT[],
    "approved_by" UUID,
    "confidence" DOUBLE PRECISION,
    "created_by" UUID,
    "gtin" VARCHAR(50),
    "keywords" TEXT[],
    "merged_into_id" UUID,
    "model" VARCHAR(100),
    "mpn" VARCHAR(100),
    "normalized_name" VARCHAR(255),
    "rejection_reason" TEXT,
    "status" "public"."product_status" DEFAULT 'PENDING',
    "specs" JSONB,
    "variant_values" JSONB,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "shop_product_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shop_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(50),
    "price" DECIMAL(10,2) NOT NULL,
    "stock_quantity" INTEGER NOT NULL,
    "condition" "public"."product_condition" DEFAULT 'NEW',
    "shop_description" TEXT,
    "specs" JSONB,
    "images" TEXT[],
    "is_available" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "base_price" DECIMAL(10,2),
    "bulk_upload_id" UUID,
    "listing_status" "public"."listing_status" DEFAULT 'LIVE',
    "rejection_reason" TEXT,
    "variant_values" JSONB,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shop_products_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_product_id" UUID NOT NULL,
    "change_qty" INTEGER NOT NULL,
    "change_type" "public"."stock_change_type" NOT NULL,
    "reason" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_products_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "business_registration_no" VARCHAR(100),
    "address_line1" VARCHAR(255),
    "city" VARCHAR(100),
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "is_verified" BOOLEAN DEFAULT false,
    "delivery_enabled" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "banner" TEXT,
    "delivery_methods" TEXT[],
    "gallery" TEXT[],
    "logo" TEXT,
    "delivery_zones" TEXT[],
    "wallet_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "whatsapp_number" VARCHAR(20),
    "can_bulk_upload" BOOLEAN NOT NULL DEFAULT true,
    "base_delivery_fee" DECIMAL(10,2),
    "free_delivery_threshold" DECIMAL(10,2),
    "intercity_delivery_fee" DECIMAL(10,2),
    "location" geography(Geometry, 4326),

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tech_spec_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "category_name" VARCHAR(100) NOT NULL,
    "required_specs" JSONB NOT NULL DEFAULT '[]',
    "optional_specs" JSONB NOT NULL DEFAULT '[]',
    "spec_labels" JSONB NOT NULL DEFAULT '{}',
    "spec_validations" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tech_spec_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_before" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "status" "public"."transaction_status" NOT NULL DEFAULT 'PENDING',
    "order_id" UUID,
    "payout_reference" VARCHAR(255),
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "contact_name" VARCHAR(255) NOT NULL,
    "address_line1" VARCHAR(255) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "country" VARCHAR(100) DEFAULT 'Malawi',
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "phone_number" VARCHAR(20),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" VARCHAR(75) NOT NULL,
    "last_name" VARCHAR(75) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "public"."user_role" NOT NULL DEFAULT 'USER',
    "profile_image" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."withdrawals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "status" "public"."withdrawal_status" NOT NULL DEFAULT 'PENDING',
    "payout_method" VARCHAR(50) NOT NULL DEFAULT 'mobile_money',
    "recipient_phone" VARCHAR(20) NOT NULL,
    "recipient_name" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50),
    "tx_ref" VARCHAR(255),
    "payout_reference" VARCHAR(255),
    "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "failed_at" TIMESTAMP(6),
    "failure_reason" TEXT,
    "balance_before" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transaction_id" UUID,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_staging_batch_id" ON "public"."bulk_upload_staging"("batch_id");

-- CreateIndex
CREATE INDEX "idx_staging_bulk_upload_id" ON "public"."bulk_upload_staging"("bulk_upload_id");

-- CreateIndex
CREATE INDEX "idx_staging_shop_batch" ON "public"."bulk_upload_staging"("shop_id", "batch_id");

-- CreateIndex
CREATE INDEX "idx_staging_validation_status" ON "public"."bulk_upload_staging"("validation_status");

-- CreateIndex
CREATE INDEX "idx_bulk_uploads_batch_id" ON "public"."bulk_uploads"("batch_id");

-- CreateIndex
CREATE INDEX "idx_bulk_uploads_shop_id" ON "public"."bulk_uploads"("shop_id");

-- CreateIndex
CREATE INDEX "idx_bulk_uploads_status" ON "public"."bulk_uploads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "public"."categories"("name");

-- CreateIndex
CREATE INDEX "idx_orders_buyer_id" ON "public"."orders"("buyer_id");

-- CreateIndex
CREATE INDEX "idx_orders_release_code" ON "public"."orders"("release_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "public"."orders"("order_number");

-- CreateIndex
CREATE INDEX "idx_password_resets_expires_at" ON "public"."password_resets"("expires_at");

-- CreateIndex
CREATE INDEX "idx_password_resets_token" ON "public"."password_resets"("token");

-- CreateIndex
CREATE INDEX "idx_password_resets_user_id" ON "public"."password_resets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "public"."password_resets"("token");

-- CreateIndex
CREATE INDEX "idx_payment_reports_payment_id" ON "public"."payment_reports"("payment_id");

-- CreateIndex
CREATE INDEX "idx_payments_order_id" ON "public"."payments"("order_id");

-- CreateIndex
CREATE INDEX "idx_payments_status" ON "public"."payments"("status");

-- CreateIndex
CREATE INDEX "idx_payments_tx_ref" ON "public"."payments"("tx_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tx_ref_key" ON "public"."payments"("tx_ref");

-- CreateIndex
CREATE INDEX "idx_products_brand" ON "public"."products"("brand");

-- CreateIndex
CREATE INDEX "idx_products_gtin" ON "public"."products"("gtin");

-- CreateIndex
CREATE INDEX "idx_products_name" ON "public"."products"("name");

-- CreateIndex
CREATE INDEX "idx_products_normalized_name" ON "public"."products"("normalized_name");

-- CreateIndex
CREATE INDEX "idx_products_normalized_name_trgm" ON "public"."products" USING GIN ("normalized_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_products_specs_gin" ON "public"."products" USING GIN ("specs" jsonb_ops);

-- CreateIndex
CREATE INDEX "idx_products_status" ON "public"."products"("status");

-- CreateIndex
CREATE INDEX "idx_products_variant_values_gin" ON "public"."products" USING GIN ("variant_values" jsonb_ops);

-- CreateIndex
CREATE INDEX "idx_reviews_shop_product_id" ON "public"."reviews"("shop_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_shop_product_id_key" ON "public"."reviews"("order_id", "shop_product_id");

-- CreateIndex
CREATE INDEX "idx_shop_products_bulk_upload_id" ON "public"."shop_products"("bulk_upload_id");

-- CreateIndex
CREATE INDEX "idx_shop_products_listing_status" ON "public"."shop_products"("listing_status");

-- CreateIndex
CREATE INDEX "idx_shop_products_product_id" ON "public"."shop_products"("product_id");

-- CreateIndex
CREATE INDEX "idx_shop_products_shop_id" ON "public"."shop_products"("shop_id");

-- CreateIndex
CREATE INDEX "idx_shop_products_specs_gin" ON "public"."shop_products" USING GIN ("specs" jsonb_ops);

-- CreateIndex
CREATE INDEX "idx_shop_products_variant_values_gin" ON "public"."shop_products" USING GIN ("variant_values" jsonb_ops);

-- CreateIndex
CREATE INDEX "idx_shops_location_gist" ON "public"."shops" USING GIST ("location" gist_geography_ops);

-- CreateIndex
CREATE INDEX "idx_tech_spec_rules_name" ON "public"."tech_spec_rules"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "tech_spec_rules_category_id_key" ON "public"."tech_spec_rules"("category_id");

-- CreateIndex
CREATE INDEX "idx_transactions_created_at" ON "public"."transactions"("created_at");

-- CreateIndex
CREATE INDEX "idx_transactions_shop_id" ON "public"."transactions"("shop_id");

-- CreateIndex
CREATE INDEX "idx_transactions_status" ON "public"."transactions"("status");

-- CreateIndex
CREATE INDEX "idx_transactions_type" ON "public"."transactions"("type");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "idx_withdrawals_shop_id" ON "public"."withdrawals"("shop_id");

-- CreateIndex
CREATE INDEX "idx_withdrawals_status" ON "public"."withdrawals"("status");

-- CreateIndex
CREATE INDEX "idx_withdrawals_tx_ref" ON "public"."withdrawals"("tx_ref");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_transaction_id_key" ON "public"."withdrawals"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_tx_ref_key" ON "public"."withdrawals"("tx_ref");

-- AddForeignKey
ALTER TABLE "public"."bulk_upload_staging" ADD CONSTRAINT "bulk_upload_staging_bulk_upload_id_fkey" FOREIGN KEY ("bulk_upload_id") REFERENCES "public"."bulk_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_upload_staging" ADD CONSTRAINT "bulk_upload_staging_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_uploads" ADD CONSTRAINT "bulk_uploads_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "public"."shop_products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."order_messages" ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."user_addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."payment_reports" ADD CONSTRAINT "payment_reports_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "public"."shop_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."shop_products" ADD CONSTRAINT "shop_products_bulk_upload_id_fkey" FOREIGN KEY ("bulk_upload_id") REFERENCES "public"."bulk_uploads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."shop_products" ADD CONSTRAINT "shop_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."shop_products_log" ADD CONSTRAINT "shop_products_log_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "public"."shop_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."shops" ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tech_spec_rules" ADD CONSTRAINT "tech_spec_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."withdrawals" ADD CONSTRAINT "withdrawals_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."withdrawals" ADD CONSTRAINT "withdrawals_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

