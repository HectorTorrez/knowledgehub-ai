import { z } from 'zod';

export const importUrlSchema = z
  .object({
    url: z.string().min(1).max(2048),
    title: z.string().optional(),
  })
  .strict();

export type ImportUrlInput = z.infer<typeof importUrlSchema>;
