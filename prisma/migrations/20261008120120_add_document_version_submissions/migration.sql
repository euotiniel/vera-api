/*
  Warnings:

  - A unique constraint covering the columns `[issuedVersionId]` on the table `DocumentSubmission` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DocumentSubmissionKind" AS ENUM ('NEW_DOCUMENT', 'NEW_VERSION');

-- AlterTable
ALTER TABLE "DocumentSubmission" ADD COLUMN     "baseVersion" INTEGER,
ADD COLUMN     "issuedVersionId" TEXT,
ADD COLUMN     "kind" "DocumentSubmissionKind" NOT NULL DEFAULT 'NEW_DOCUMENT',
ADD COLUMN     "targetDocumentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSubmission_issuedVersionId_key" ON "DocumentSubmission"("issuedVersionId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_targetDocumentId_idx" ON "DocumentSubmission"("targetDocumentId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_kind_status_idx" ON "DocumentSubmission"("kind", "status");

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_issuedVersionId_fkey" FOREIGN KEY ("issuedVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
