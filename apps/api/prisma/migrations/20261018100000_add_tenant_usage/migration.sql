-- CreateTable
CREATE TABLE "TenantUsage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantUsage_organizationId_idx" ON "TenantUsage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUsage_organizationId_kind_periodStart_key" ON "TenantUsage"("organizationId", "kind", "periodStart");

-- AddForeignKey
ALTER TABLE "TenantUsage" ADD CONSTRAINT "TenantUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
