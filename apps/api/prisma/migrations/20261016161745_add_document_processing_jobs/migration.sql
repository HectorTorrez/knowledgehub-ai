-- CreateEnum
CREATE TYPE "DocumentFailureKind" AS ENUM ('VERIFICATION', 'PROCESSING');

-- CreateEnum
CREATE TYPE "ProcessingJobState" AS ENUM ('QUEUED', 'CLAIMED', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "failureKind" "DocumentFailureKind",
ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DocumentProcessingJob" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "verifiedStorageKey" TEXT NOT NULL,
    "state" "ProcessingJobState" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_nextAttemptAt_id_idx" ON "DocumentProcessingJob"("nextAttemptAt", "id") WHERE (state = 'QUEUED');

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_documentId_documentGeneration_idx" ON "DocumentProcessingJob"("documentId", "documentGeneration");

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_organizationId_state_idx" ON "DocumentProcessingJob"("organizationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentProcessingJob_documentId_key" ON "DocumentProcessingJob"("documentId") WHERE (state IN ('QUEUED', 'CLAIMED'));

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Document" SET "failureKind" = 'VERIFICATION' WHERE "status" = 'FAILED';
