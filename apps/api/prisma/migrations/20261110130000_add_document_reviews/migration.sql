-- AlterEnum
ALTER TYPE "OrganizationActivityAction" ADD VALUE 'DOCUMENT_REVIEW_UPDATED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewDueAt" TIMESTAMP(3),
ADD COLUMN     "reviewOwnerMembershipId" UUID;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewOwnerMembershipId_fkey" FOREIGN KEY ("reviewOwnerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

