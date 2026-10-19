import { z } from 'zod';

export const ANSWER_LIST_DEFAULT_LIMIT = 25;
export const ANSWER_LIST_MAX_LIMIT = 100;

export const listAnswersSchema = z
  .object({
    limit: z.coerce
      .number()
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(ANSWER_LIST_MAX_LIMIT, `limit must be at most ${ANSWER_LIST_MAX_LIMIT}`)
      .default(ANSWER_LIST_DEFAULT_LIMIT),
    cursor: z.string().min(1, 'cursor must not be empty').optional(),
    conversationId: z.uuid('conversationId must be a UUID').optional(),
  })
  .strict();

export type ListAnswersInput = z.infer<typeof listAnswersSchema>;
