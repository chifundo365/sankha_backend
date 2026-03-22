/*
  Warnings:

  - You are about to alter the column `location` on the `shops` table. The data in that column could be lost. The data in that column will be cast from `geography` to `Unsupported("geography")`.

*/
-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "avg_rating" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "shop_score" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "total_reviews" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "location" SET DATA TYPE geography;
