/*
  Warnings:

  - You are about to alter the column `location` on the `shops` table. The data in that column could be lost. The data in that column will be cast from `geography` to `Unsupported("geography")`.

*/
-- AlterTable
ALTER TABLE "shops" ALTER COLUMN "location" SET DATA TYPE geography;
