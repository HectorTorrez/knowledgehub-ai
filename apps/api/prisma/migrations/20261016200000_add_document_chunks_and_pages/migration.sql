-- AlterTable
ALTER TABLE "DocumentExtraction" ADD COLUMN     "pages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "pageCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DocumentExtraction" ALTER COLUMN "pages" DROP DEFAULT,
ALTER COLUMN "pageCount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DocumentExtraction" DROP COLUMN "content";

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_documentGeneration_chunkIndex_key" ON "DocumentChunk"("documentId", "documentGeneration", "chunkIndex");

-- CreateIndex
CREATE INDEX "DocumentChunk_organizationId_idx" ON "DocumentChunk"("organizationId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_documentGeneration_idx" ON "DocumentChunk"("documentId", "documentGeneration");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
