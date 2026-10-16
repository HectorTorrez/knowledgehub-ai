import { z } from 'zod';

const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'email is required')
      .max(EMAIL_MAX_LENGTH, `email must be at most ${EMAIL_MAX_LENGTH} characters`)
      .pipe(z.email('email must be a valid email address')),
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      ),
    firstName: z
      .string()
      .trim()
      .min(1, 'firstName is required')
      .max(NAME_MAX_LENGTH, `firstName must be at most ${NAME_MAX_LENGTH} characters`),
    lastName: z
      .string()
      .trim()
      .min(1, 'lastName is required')
      .max(NAME_MAX_LENGTH, `lastName must be at most ${NAME_MAX_LENGTH} characters`),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
