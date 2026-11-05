import { z } from 'zod';
import { emailLocaleSchema } from '../../email/email-locale.schema.js';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const TOKEN_MAX_LENGTH = 512;

export const requestPasswordResetSchema = z
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
    locale: emailLocaleSchema,
  })
  .strict();

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .min(1, 'token is required')
      .max(
        TOKEN_MAX_LENGTH,
        `token must be at most ${TOKEN_MAX_LENGTH} characters`,
      ),
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
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
