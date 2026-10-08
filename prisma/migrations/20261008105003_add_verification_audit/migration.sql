-- CreateTable
CREATE TABLE "VerificationAuditEvent" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "verdictCode" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "publicId" TEXT,
    "documentId" TEXT,
    "hash" TEXT,
    "matched" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_createdAt_idx" ON "VerificationAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_method_createdAt_idx" ON "VerificationAuditEvent"("method", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_verdictCode_createdAt_idx" ON "VerificationAuditEvent"("verdictCode", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_verified_createdAt_idx" ON "VerificationAuditEvent"("verified", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_publicId_createdAt_idx" ON "VerificationAuditEvent"("publicId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationAuditEvent_documentId_createdAt_idx" ON "VerificationAuditEvent"("documentId", "createdAt");
