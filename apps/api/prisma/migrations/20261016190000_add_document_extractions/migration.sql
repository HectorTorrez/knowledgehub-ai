-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "verifiedStorageKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_documentId_documentGeneration_key" ON "DocumentExtraction"("documentId", "documentGeneration");

-- CreateIndex
CREATE INDEX "DocumentExtraction_organizationId_idx" ON "DocumentExtraction"("organizationId");

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
