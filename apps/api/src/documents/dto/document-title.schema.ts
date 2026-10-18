import { z } from 'zod';

export const DOCUMENT_TITLE_MAX_LENGTH = 200;

export const documentTitleSchema = z
  .string()
  .trim()
  .min(1, 'title is required')
  .max(
    DOCUMENT_TITLE_MAX_LENGTH,
    `title must be at most ${DOCUMENT_TITLE_MAX_LENGTH} characters`,
  );

export type DocumentTitle = z.infer<typeof documentTitleSchema>;
