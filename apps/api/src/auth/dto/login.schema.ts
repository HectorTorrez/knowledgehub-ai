import { z } from 'zod';

const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'email is required')
      .max(EMAIL_MAX_LENGTH, `email must be at most ${EMAIL_MAX_LENGTH} characters`)
      .pipe(z.email('email must be a valid email address')),
    password: z
      .string()
      .min(1, 'password is required')
      .max(
        PASSWORD_MAX_LENGTH,
        `password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      ),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
