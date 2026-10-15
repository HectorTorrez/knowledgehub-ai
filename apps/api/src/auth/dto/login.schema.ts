import { z } from 'zod';

const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;

/**
 * Request contract for `POST /auth/login`.
 *
 * The email accepts the same shape as registration so a valid registered
 * address is always accepted here. The password is only required to be present
 * and bounded: it is deliberately not held to the registration minimum, because
 * an incorrect password must surface as a generic 401 (not a 400 that leaks the
 * password policy), and it is never trimmed, cased or otherwise transformed, so
 * the exact bytes the user typed are what gets verified.
 *
 * Unknown fields are rejected (`.strict()`), matching registration.
 */
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
