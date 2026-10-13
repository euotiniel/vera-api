-- CreateEnum
CREATE TYPE "OrganizationVerificationStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'SUSPENDED',
  'REVOKED'
);

-- CreateEnum
CREATE TYPE "OrganizationVerificationEventSource" AS ENUM (
  'MIGRATION',
  'ADMIN'
);

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "verificationStatus"
"OrganizationVerificationStatus"
NOT NULL
DEFAULT 'PENDING';

-- Deterministic backfill from legacy verified flag.
UPDATE "Organization"
SET "verificationStatus" =
  CASE
    WHEN "verified" = TRUE
      THEN 'VERIFIED'::"OrganizationVerificationStatus"
    ELSE
      'PENDING'::"OrganizationVerificationStatus"
  END;

-- CreateTable
CREATE TABLE "OrganizationVerificationEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT,
  "source" "OrganizationVerificationEventSource"
    NOT NULL
    DEFAULT 'ADMIN',
  "fromStatus" "OrganizationVerificationStatus",
  "toStatus" "OrganizationVerificationStatus"
    NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrganizationVerificationEvent_pkey"
    PRIMARY KEY ("id")
);

-- Baseline audit event for pre-existing organizations.
INSERT INTO "OrganizationVerificationEvent" (
  "id",
  "organizationId",
  "actorId",
  "source",
  "fromStatus",
  "toStatus",
  "reason",
  "createdAt"
)
SELECT
  'legacy-' || "id",
  "id",
  NULL,
  'MIGRATION'::"OrganizationVerificationEventSource",
  NULL,
  CASE
    WHEN "verified" = TRUE
      THEN 'VERIFIED'::"OrganizationVerificationStatus"
    ELSE
      'PENDING'::"OrganizationVerificationStatus"
  END,
  'Migrated from legacy verified flag.',
  CURRENT_TIMESTAMP
FROM "Organization";

-- CreateIndex
CREATE INDEX "Organization_verificationStatus_idx"
ON "Organization"("verificationStatus");

-- CreateIndex
CREATE INDEX "OrganizationVerificationEvent_organizationId_idx"
ON "OrganizationVerificationEvent"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationVerificationEvent_organizationId_createdAt_idx"
ON "OrganizationVerificationEvent"(
  "organizationId",
  "createdAt"
);

-- CreateIndex
CREATE INDEX "OrganizationVerificationEvent_actorId_idx"
ON "OrganizationVerificationEvent"("actorId");

-- CreateIndex
CREATE INDEX "OrganizationVerificationEvent_toStatus_idx"
ON "OrganizationVerificationEvent"("toStatus");

-- AddForeignKey
ALTER TABLE "OrganizationVerificationEvent"
ADD CONSTRAINT "OrganizationVerificationEvent_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationVerificationEvent"
ADD CONSTRAINT "OrganizationVerificationEvent_actorId_fkey"
FOREIGN KEY ("actorId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
