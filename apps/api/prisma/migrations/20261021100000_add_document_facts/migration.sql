-- CreateEnum
CREATE TYPE "FactsStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "FactType" AS ENUM ('CONTRACT_TOTAL');

-- AlterTable
ALTER TABLE "Document"
    ADD COLUMN "factsStatus" "FactsStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "factsFailureReason" TEXT;

-- CreateTable
CREATE TABLE "DocumentFact" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "factType" "FactType" NOT NULL,
    "naturalKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "scale" INTEGER NOT NULL DEFAULT 2,
    "currency" CHAR(3) NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "chunkIndex" INTEGER,
    "evidenceText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFact_documentId_documentGeneration_factType_naturalKey_key"
    ON "DocumentFact"("documentId", "documentGeneration", "factType", "naturalKey");

-- CreateIndex
CREATE INDEX "DocumentFact_organizationId_factType_currency_idx"
    ON "DocumentFact"("organizationId", "factType", "currency");

-- CreateIndex
CREATE INDEX "DocumentFact_organizationId_documentId_documentGeneration_idx"
    ON "DocumentFact"("organizationId", "documentId", "documentGeneration");

-- CreateIndex
CREATE INDEX "Document_organizationId_factsStatus_idx"
    ON "Document"("organizationId", "factsStatus");

-- AddForeignKey
ALTER TABLE "DocumentFact"
    ADD CONSTRAINT "DocumentFact_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
