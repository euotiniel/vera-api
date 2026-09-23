/*
  Warnings:

  - A unique constraint covering the columns `[qrProof]` on the table `DocumentVersion` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "qrProof" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_qrProof_key" ON "DocumentVersion"("qrProof");
