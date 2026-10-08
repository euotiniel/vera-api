-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "replacedById" TEXT;

-- CreateIndex
CREATE INDEX "Document_replacedById_idx" ON "Document"("replacedById");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
