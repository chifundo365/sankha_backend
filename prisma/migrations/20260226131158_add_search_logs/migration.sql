/*
  Warnings:

  - You are about to alter the column `location` on the `shops` table. The data in that column could be lost. The data in that column will be cast from `geography` to `Unsupported("geography")`.

*/
-- AlterTable
ALTER TABLE "shops" ALTER COLUMN "location" SET DATA TYPE geography;

-- CreateTable
CREATE TABLE "search_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query" TEXT NOT NULL,
    "results_count" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB,
    "buyer_has_coords" BOOLEAN NOT NULL DEFAULT false,
    "response_time_ms" INTEGER NOT NULL DEFAULT 0,
    "page" INTEGER NOT NULL DEFAULT 1,
    "limit_per_page" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_logs_query_idx" ON "search_logs"("query");

-- CreateIndex
CREATE INDEX "search_logs_created_at_idx" ON "search_logs"("created_at");

-- CreateIndex
CREATE INDEX "search_logs_results_count_idx" ON "search_logs"("results_count");
