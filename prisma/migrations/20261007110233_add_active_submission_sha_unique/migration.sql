CREATE UNIQUE INDEX "DocumentSubmission_active_organizationId_sha256_key"
ON "DocumentSubmission" ("organizationId", "sha256")
WHERE "status" IN (
  'DRAFT',
  'PENDING_REVIEW',
  'PENDING_APPROVAL'
);
