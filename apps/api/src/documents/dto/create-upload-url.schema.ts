import { z } from 'zod';
import { ALLOWED_UPLOAD_CONTENT_TYPES } from '../upload-policy.js';

export const createUploadUrlSchema = z
  .object({
    contentType: z.enum(ALLOWED_UPLOAD_CONTENT_TYPES, {
      error: 'contentType is not an allowed upload type',
    }),
    sizeBytes: z
      .int({ error: 'sizeBytes must be an integer' })
      .positive({ error: 'sizeBytes must be a positive integer' })
      .optional(),
  })
  .strict();

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;
