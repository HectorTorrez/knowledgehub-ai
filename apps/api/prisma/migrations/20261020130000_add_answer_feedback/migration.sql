-- CreateEnum
CREATE TYPE "AnswerFeedbackValue" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "AnswerFeedback" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" "AnswerFeedbackValue" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnswerFeedback_answerId_userId_key" ON "AnswerFeedback"("answerId", "userId");

-- CreateIndex
CREATE INDEX "AnswerFeedback_answerId_idx" ON "AnswerFeedback"("answerId");

-- AddForeignKey
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
