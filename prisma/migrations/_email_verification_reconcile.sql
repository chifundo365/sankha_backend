-- AlterEnum
BEGIN;
CREATE TYPE "withdrawal_status_new" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
ALTER TABLE "public"."withdrawals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "withdrawals" ALTER COLUMN "status" TYPE "withdrawal_status_new" USING ("status"::text::"withdrawal_status_new");
ALTER TYPE "withdrawal_status" RENAME TO "withdrawal_status_old";
ALTER TYPE "withdrawal_status_new" RENAME TO "withdrawal_status";
DROP TYPE "public"."withdrawal_status_old";
ALTER TABLE "withdrawals" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX "public"."idx_withdrawals_charge_id";

-- AlterTable
ALTER TABLE "shops" DROP COLUMN "seller_debt_balance",
ALTER COLUMN "location" SET DATA TYPE geography;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified" BOOLEAN DEFAULT false,
ADD COLUMN     "email_verify_expires" TIMESTAMP(3),
ADD COLUMN     "email_verify_token" TEXT;

-- AlterTable
ALTER TABLE "withdrawals" DROP COLUMN "bank_fee",
DROP COLUMN "charge_id",
DROP COLUMN "debt_deducted",
DROP COLUMN "destination_uuid",
DROP COLUMN "paychangu_fee";

-- Add recipient columns with defaults to satisfy existing rows, then drop defaults
ALTER TABLE "withdrawals" ADD COLUMN "recipient_name" VARCHAR(255) NOT NULL DEFAULT 'Unknown';
ALTER TABLE "withdrawals" ADD COLUMN "recipient_phone" VARCHAR(20) NOT NULL DEFAULT '0000000000';
ALTER TABLE "withdrawals" ALTER COLUMN "recipient_name" DROP DEFAULT;
ALTER TABLE "withdrawals" ALTER COLUMN "recipient_phone" DROP DEFAULT;

-- DropTable
DROP TABLE "public"."payout_operators";

