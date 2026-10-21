import { z } from 'zod';

export const SEARCH_QUERY_MAX_LENGTH = 2000;
export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 50;

export const searchSchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, 'q is required')
      .max(
        SEARCH_QUERY_MAX_LENGTH,
        `q must be at most ${SEARCH_QUERY_MAX_LENGTH} characters`,
      ),
    limit: z.coerce
      .number()
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(SEARCH_MAX_LIMIT, `limit must be at most ${SEARCH_MAX_LIMIT}`)
      .default(SEARCH_DEFAULT_LIMIT),
    documentId: z.uuid('documentId must be a UUID').optional(),
  })
  .strict();

export type SearchInput = z.infer<typeof searchSchema>;
