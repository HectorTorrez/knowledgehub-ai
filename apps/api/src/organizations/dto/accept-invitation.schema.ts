import { z } from 'zod';

export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .min(1, 'token is required')
      .max(512, 'token is too long'),
  })
  .strict();

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
