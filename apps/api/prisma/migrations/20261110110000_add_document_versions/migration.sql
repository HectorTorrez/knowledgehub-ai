-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pendingReplacement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersion_organizationId_documentId_idx" ON "DocumentVersion"("organizationId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_generation_key" ON "DocumentVersion"("documentId", "generation");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DocumentVersion" ("id", "documentId", "organizationId", "generation", "storageKey", "originalFileName", "contentType", "sizeBytes", "createdAt")
SELECT gen_random_uuid(), "id", "organizationId", "generation", "storageKey", "originalFileName", "contentType", "sizeBytes", "updatedAt"
FROM "Document" WHERE "storageKey" IS NOT NULL AND "generation" > 0;
