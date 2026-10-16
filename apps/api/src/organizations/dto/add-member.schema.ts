import { z } from 'zod';

const EMAIL_MAX_LENGTH = 254;

export const addMemberSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'email is required')
      .max(
        EMAIL_MAX_LENGTH,
        `email must be at most ${EMAIL_MAX_LENGTH} characters`,
      )
      .pipe(z.email('email must be a valid email address')),
  })
  .strict();

export type AddMemberInput = z.infer<typeof addMemberSchema>;
