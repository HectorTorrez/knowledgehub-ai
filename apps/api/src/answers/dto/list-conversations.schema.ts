import { z } from 'zod';

export const CONVERSATION_LIST_DEFAULT_LIMIT = 25;
export const CONVERSATION_LIST_MAX_LIMIT = 100;

export const listConversationsSchema = z
  .object({
    limit: z.coerce
      .number()
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(
        CONVERSATION_LIST_MAX_LIMIT,
        `limit must be at most ${CONVERSATION_LIST_MAX_LIMIT}`,
      )
      .default(CONVERSATION_LIST_DEFAULT_LIMIT),
    cursor: z.string().min(1, 'cursor must not be empty').optional(),
  })
  .strict();

export type ListConversationsInput = z.infer<typeof listConversationsSchema>;
