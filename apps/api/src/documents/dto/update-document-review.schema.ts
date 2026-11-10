import { z } from 'zod';

export const updateDocumentReviewSchema = z
  .object({
    ownerId: z.uuid().nullable(),
    dueDate: z.iso.date().nullable(),
    markReviewed: z.boolean().default(false),
  })
  .strict();

export type UpdateDocumentReviewInput = z.infer<
  typeof updateDocumentReviewSchema
>;
