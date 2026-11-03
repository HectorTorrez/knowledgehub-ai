ALTER TYPE "OrganizationActivityAction" ADD VALUE 'COLLECTION_CREATED';
ALTER TYPE "OrganizationActivityAction" ADD VALUE 'COLLECTION_UPDATED';
ALTER TYPE "OrganizationActivityAction" ADD VALUE 'COLLECTION_DELETED';

CREATE TABLE "Collection" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Collection_organizationId_idx" ON "Collection"("organizationId");
CREATE UNIQUE INDEX "Collection_organizationId_name_lower_key" ON "Collection"("organizationId", lower("name"));
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocumentCollection" (
  "documentId" UUID NOT NULL,
  "collectionId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  CONSTRAINT "DocumentCollection_pkey" PRIMARY KEY ("documentId", "collectionId")
);
CREATE INDEX "DocumentCollection_organizationId_collectionId_idx" ON "DocumentCollection"("organizationId", "collectionId");
ALTER TABLE "DocumentCollection" ADD CONSTRAINT "DocumentCollection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentCollection" ADD CONSTRAINT "DocumentCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentCollection" ADD CONSTRAINT "DocumentCollection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
