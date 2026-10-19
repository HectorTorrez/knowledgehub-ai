import { z } from 'zod';
import type { DocumentStatus } from '@knowledgehub/shared-types';

export const DOCUMENT_LIST_DEFAULT_LIMIT = 25;
export const DOCUMENT_LIST_MAX_LIMIT = 100;
export const DOCUMENT_LIST_MAX_QUERY_CHARS = 200;

const DOCUMENT_STATUSES: [DocumentStatus, ...DocumentStatus[]] = [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
];

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
    q: z
      .string()
      .trim()
      .min(1, 'q must not be empty')
      .max(DOCUMENT_LIST_MAX_QUERY_CHARS, 'q is too long')
      .optional(),
    status: z.enum(DOCUMENT_STATUSES).optional(),
    order: z.enum(['createdAt_desc', 'createdAt_asc']).default('createdAt_desc'),
  })
  .strict();

export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;
