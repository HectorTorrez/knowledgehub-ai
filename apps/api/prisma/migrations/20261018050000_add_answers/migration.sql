-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('answered', 'insufficient_evidence');

-- CreateTable
CREATE TABLE "Answer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "askedById" UUID,
    "question" TEXT NOT NULL,
    "status" "AnswerStatus" NOT NULL,
    "answer" TEXT,
    "citations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Answer_organizationId_createdAt_idx" ON "Answer"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
