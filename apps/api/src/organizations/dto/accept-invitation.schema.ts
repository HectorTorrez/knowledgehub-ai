import { z } from 'zod';
import { registerSchema } from '../../auth/dto/register.schema.js';

const invitationToken = z
  .string()
  .min(1, 'token is required')
  .max(512, 'token is too long');

export const acceptInvitationSchema = z
  .object({ token: invitationToken })
  .strict();

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const acceptInvitationWithNewAccountSchema = registerSchema
  .pick({ password: true, firstName: true, lastName: true })
  .extend({ token: invitationToken })
  .strict();

export type AcceptInvitationWithNewAccountInput = z.infer<
  typeof acceptInvitationWithNewAccountSchema
>;
