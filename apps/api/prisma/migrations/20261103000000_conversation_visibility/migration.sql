CREATE TYPE "ConversationVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION');
ALTER TABLE "Conversation" ADD COLUMN "createdById" UUID, ADD COLUMN "visibility" "ConversationVisibility" NOT NULL DEFAULT 'ORGANIZATION';
UPDATE "Conversation" c SET "createdById" = authors."askedById"
FROM (SELECT "conversationId", MIN("askedById"::text)::uuid AS "askedById" FROM "Answer" WHERE "conversationId" IS NOT NULL GROUP BY "conversationId" HAVING COUNT(*) = COUNT("askedById") AND COUNT(DISTINCT "askedById") = 1) authors
WHERE c.id = authors."conversationId";
ALTER TABLE "Conversation" ALTER COLUMN "visibility" SET DEFAULT 'PRIVATE';
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Conversation_organizationId_createdById_idx" ON "Conversation"("organizationId", "createdById");
ALTER TYPE "OrganizationActivityAction" ADD VALUE 'CONVERSATION_SHARED';
ALTER TYPE "OrganizationActivityAction" ADD VALUE 'CONVERSATION_UNSHARED';
