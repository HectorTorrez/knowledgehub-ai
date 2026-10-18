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
    stream: z.boolean('stream must be a boolean').optional(),
  })
  .strict();

export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;
