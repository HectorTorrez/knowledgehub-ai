import { z } from 'zod';
import { documentTitleSchema } from './document-title.schema.js';

export const createDocumentSchema = z
  .object({
    title: documentTitleSchema,
  })
  .strict();

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
