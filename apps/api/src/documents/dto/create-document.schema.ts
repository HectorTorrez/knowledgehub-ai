import { z } from 'zod';

const TITLE_MAX_LENGTH = 200;

export const createDocumentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'title is required')
      .max(
        TITLE_MAX_LENGTH,
        `title must be at most ${TITLE_MAX_LENGTH} characters`,
      ),
  })
  .strict();

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
