-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "uploadStorageKey" TEXT;

-- Staging keys recorded before verification existed are unverified, so they are
-- moved to uploadStorageKey and the verified column is cleared.
UPDATE "Document"
SET "uploadStorageKey" = "storageKey",
    "storageKey" = NULL
WHERE "storageKey" IS NOT NULL;
