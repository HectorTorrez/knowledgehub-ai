ALTER TYPE "AnswerStatus" ADD VALUE 'partial';
ALTER TABLE "Answer" ADD COLUMN "missing" JSONB;
