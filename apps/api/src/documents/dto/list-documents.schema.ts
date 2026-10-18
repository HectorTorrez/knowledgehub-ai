import { z } from 'zod';

export const DOCUMENT_LIST_DEFAULT_LIMIT = 25;
export const DOCUMENT_LIST_MAX_LIMIT = 100;

export const listDocumentsSchema = z
  .object({
    limit: z.coerce
      .number()
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(
        DOCUMENT_LIST_MAX_LIMIT,
        `limit must be at most ${DOCUMENT_LIST_MAX_LIMIT}`,
      )
      .default(DOCUMENT_LIST_DEFAULT_LIMIT),
    cursor: z.string().min(1, 'cursor must not be empty').optional(),
  })
  .strict();

export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;
