/*
  Warnings:

  - A unique constraint covering the columns `[storageKey]` on the table `DocumentVersion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OriginalFileAccess" AS ENUM ('PUBLIC', 'RESTRICTED', 'PRIVATE');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "originalFileAccess" "OriginalFileAccess" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "storageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_storageKey_key" ON "DocumentVersion"("storageKey");
