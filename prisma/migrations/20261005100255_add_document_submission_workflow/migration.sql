-- CreateEnum
CREATE TYPE "DocumentSubmissionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentSubmissionStage" AS ENUM ('REVIEW', 'APPROVAL');

-- CreateEnum
CREATE TYPE "DocumentSubmissionDecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "DocumentSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "reference" TEXT,
    "issuedAt" TIMESTAMP(3),
    "originalFileAccess" "OriginalFileAccess" NOT NULL DEFAULT 'PUBLIC',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSubmissionDecision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "stage" "DocumentSubmissionStage" NOT NULL,
    "decision" "DocumentSubmissionDecisionOutcome" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSubmissionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSubmission_storageKey_key" ON "DocumentSubmission"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSubmission_documentId_key" ON "DocumentSubmission"("documentId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_organizationId_idx" ON "DocumentSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_creatorId_idx" ON "DocumentSubmission"("creatorId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_status_idx" ON "DocumentSubmission"("status");

-- CreateIndex
CREATE INDEX "DocumentSubmission_sha256_idx" ON "DocumentSubmission"("sha256");

-- CreateIndex
CREATE INDEX "DocumentSubmission_organizationId_status_idx" ON "DocumentSubmission"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DocumentSubmissionDecision_submissionId_idx" ON "DocumentSubmissionDecision"("submissionId");

-- CreateIndex
CREATE INDEX "DocumentSubmissionDecision_actorId_idx" ON "DocumentSubmissionDecision"("actorId");

-- CreateIndex
CREATE INDEX "DocumentSubmissionDecision_stage_idx" ON "DocumentSubmissionDecision"("stage");

-- CreateIndex
CREATE INDEX "DocumentSubmissionDecision_decision_idx" ON "DocumentSubmissionDecision"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSubmissionDecision_submissionId_stage_key" ON "DocumentSubmissionDecision"("submissionId", "stage");

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmissionDecision" ADD CONSTRAINT "DocumentSubmissionDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DocumentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmissionDecision" ADD CONSTRAINT "DocumentSubmissionDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
