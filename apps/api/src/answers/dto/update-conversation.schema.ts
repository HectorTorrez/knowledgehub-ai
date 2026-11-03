import { z } from 'zod';

export const updateConversationSchema = z
  .object({
    visibility: z.enum(['PRIVATE', 'ORGANIZATION']),
  })
  .strict();

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
