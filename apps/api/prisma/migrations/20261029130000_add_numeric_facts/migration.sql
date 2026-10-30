ALTER TYPE "FactType" ADD VALUE 'NUMERIC_VALUE';

ALTER TABLE "DocumentFact"
  ALTER COLUMN "currency" DROP NOT NULL,
  ADD COLUMN "field" TEXT,
  ADD COLUMN "fieldLabel" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "entityLabel" TEXT,
  ADD COLUMN "occurredOn" DATE,
  ADD COLUMN "isTotal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DocumentFact_organizationId_factType_field_idx"
  ON "DocumentFact"("organizationId", "factType", "field");
