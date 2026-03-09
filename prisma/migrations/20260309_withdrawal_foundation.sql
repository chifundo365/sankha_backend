-- Withdrawal System Foundation Migration
-- Sankha 4.0 — PayChangu Payout Integration

-- 1. Add DEBT_CLEARED to withdrawal_status enum
ALTER TYPE "withdrawal_status" ADD VALUE IF NOT EXISTS 'DEBT_CLEARED';

-- 2. Add seller_debt_balance to shops
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "seller_debt_balance" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- 3. Modify withdrawals table: add new columns
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "charge_id" VARCHAR(255);
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "destination_uuid" VARCHAR(255);
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "paychangu_fee" DECIMAL(12, 2);
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "bank_fee" DECIMAL(12, 2);
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "debt_deducted" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- 4. Remove recipient_phone and recipient_name from withdrawals (account details must never be stored)
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "recipient_phone";
ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "recipient_name";

-- 5. Add index on charge_id for withdrawal verification job lookups
CREATE INDEX IF NOT EXISTS "idx_withdrawals_charge_id" ON "withdrawals" ("charge_id");

-- 6. Create payout_operators table
CREATE TABLE IF NOT EXISTS "payout_operators" (
  "id" TEXT NOT NULL,
  "uuid" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_operators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payout_operators_uuid_key" ON "payout_operators" ("uuid");

-- 7. Pre-seed payout_operators with all 9 PayChangu destinations
INSERT INTO "payout_operators" ("id", "uuid", "name", "type", "is_active", "cached_at", "updated_at")
VALUES
  ('seed_nbm', '82310dd1-ec9b-4fe7-a32c-2f262ef08681', 'National Bank of Malawi', 'BANK', true, NOW(), NOW()),
  ('seed_eco', '87e62436-0553-4fb5-a76d-f27d28420c5b', 'Ecobank Malawi Limited', 'BANK', true, NOW(), NOW()),
  ('seed_fdh', 'b064172a-8a1b-4f7f-aad7-81b036c46c57', 'FDH Bank Limited', 'BANK', true, NOW(), NOW()),
  ('seed_std', 'e7447c2c-c147-4907-b194-e087fe8d8585', 'Standard Bank Limited', 'BANK', true, NOW(), NOW()),
  ('seed_cen', '236760c9-3045-4a01-990e-497b28d115bb', 'Centenary Bank', 'BANK', true, NOW(), NOW()),
  ('seed_fst', '968ac588-3b1f-4d89-81ff-a3d43a599003', 'First Capital Limited', 'BANK', true, NOW(), NOW()),
  ('seed_cdh', 'c759d7b6-ae5c-4a95-814a-79171271897a', 'CDH Investment Bank', 'BANK', true, NOW(), NOW()),
  ('seed_tnm', '5e9946ae-76ed-43f5-ad59-63e09096006a', 'TNM Mpamba', 'MOBILE_MONEY', true, NOW(), NOW()),
  ('seed_air', 'e8d5fca0-e5ac-4714-a518-484be9011326', 'Airtel Money', 'MOBILE_MONEY', true, NOW(), NOW())
ON CONFLICT ("uuid") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "is_active" = EXCLUDED."is_active",
  "cached_at" = NOW(),
  "updated_at" = NOW();
