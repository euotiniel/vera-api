-- CreateEnum
CREATE TYPE "DocumentLifecycleEventType" AS ENUM ('REGISTERED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "DocumentLifecycleEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "DocumentLifecycleEventType" NOT NULL,
    "fromStatus" "DocumentStatus",
    "toStatus" "DocumentStatus" NOT NULL,
    "reason" TEXT,
    "previousEventHash" TEXT,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLifecycleEvent_eventHash_key" ON "DocumentLifecycleEvent"("eventHash");

-- CreateIndex
CREATE INDEX "DocumentLifecycleEvent_documentId_createdAt_idx" ON "DocumentLifecycleEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentLifecycleEvent_previousEventHash_idx" ON "DocumentLifecycleEvent"("previousEventHash");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLifecycleEvent_documentId_sequence_key" ON "DocumentLifecycleEvent"("documentId", "sequence");

-- AddForeignKey
ALTER TABLE "DocumentLifecycleEvent" ADD CONSTRAINT "DocumentLifecycleEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
