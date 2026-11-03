ALTER TABLE "Document" ADD COLUMN "summaryStatus" "FactsStatus" NOT NULL DEFAULT 'PENDING', ADD COLUMN "summaryFailureReason" TEXT;

CREATE TABLE "DocumentSummary" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "summary" VARCHAR(1200) NOT NULL,
    "keyTopics" TEXT[] NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentSummary_documentId_documentGeneration_key" ON "DocumentSummary"("documentId", "documentGeneration");
CREATE INDEX "DocumentSummary_organizationId_documentId_documentGeneration_idx" ON "DocumentSummary"("organizationId", "documentId", "documentGeneration");
ALTER TABLE "DocumentSummary" ADD CONSTRAINT "DocumentSummary_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
