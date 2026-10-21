import { z } from 'zod';

export const ANSWER_FEEDBACK_COMMENT_MAX_LENGTH = 1000;

export const setAnswerFeedbackSchema = z
  .object({
    value: z.enum(['UP', 'DOWN'], 'value must be UP or DOWN'),
    comment: z
      .string()
      .trim()
      .max(
        ANSWER_FEEDBACK_COMMENT_MAX_LENGTH,
        `comment must be at most ${ANSWER_FEEDBACK_COMMENT_MAX_LENGTH} characters`,
      )
      .optional(),
  })
  .strict();

export type SetAnswerFeedbackInput = z.infer<typeof setAnswerFeedbackSchema>;
