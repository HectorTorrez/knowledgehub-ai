import { z } from 'zod';

export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(128),
    confirmation: z.literal('DELETE'),
  })
  .strict();

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
