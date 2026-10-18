import { z } from 'zod';
import { documentTitleSchema } from './document-title.schema.js';

export const updateDocumentSchema = z
  .object({
    title: documentTitleSchema,
  })
  .strict();

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
