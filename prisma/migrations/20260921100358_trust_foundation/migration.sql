-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attestation_documentVersionId_key" ON "Attestation"("documentVersionId");

-- CreateIndex
CREATE INDEX "Attestation_keyId_idx" ON "Attestation"("keyId");

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
