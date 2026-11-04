import { z } from 'zod';
import { emailLocaleSchema } from '../../email/email-locale.schema.js';

const TOKEN_MAX_LENGTH = 512;

export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .min(1, 'token is required')
      .max(
        TOKEN_MAX_LENGTH,
        `token must be at most ${TOKEN_MAX_LENGTH} characters`,
      ),
  })
  .strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z
  .object({ locale: emailLocaleSchema })
  .strict();

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
