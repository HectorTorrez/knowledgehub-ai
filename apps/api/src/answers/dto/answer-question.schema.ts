import { z } from 'zod';
import { MAX_ANSWER_QUESTION_CHARS } from '../answer-policy.js';

export const answerQuestionSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(1, 'question is required')
      .max(
        MAX_ANSWER_QUESTION_CHARS,
        `question must be at most ${MAX_ANSWER_QUESTION_CHARS} characters`,
      ),
    documentId: z.uuid('documentId must be a UUID').optional(),
    conversationId: z.uuid('conversationId must be a UUID').optional(),
    stream: z.boolean('stream must be a boolean').optional(),
  })
  .strict();

export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;
