CREATE TYPE "OrganizationActivityAction" AS ENUM ('MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'MEMBER_LEFT', 'INVITATION_CREATED', 'INVITATION_REVOKED', 'INVITATION_ACCEPTED', 'ORGANIZATION_RENAMED', 'DOCUMENT_UPLOADED', 'DOCUMENT_RENAMED', 'DOCUMENT_DELETED', 'DOCUMENT_REPROCESSED');

CREATE TABLE "OrganizationActivity" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "action" "OrganizationActivityAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationActivity_organizationId_createdAt_idx" ON "OrganizationActivity"("organizationId", "createdAt");

ALTER TABLE "OrganizationActivity" ADD CONSTRAINT "OrganizationActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationActivity" ADD CONSTRAINT "OrganizationActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
