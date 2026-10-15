import { z } from 'zod';

const EMAIL_MAX_LENGTH = 254;

/**
 * Request contract for `POST /organizations/:organizationId/members`.
 *
 * Only `email` is accepted, validated to the same shape as registration so the
 * stored (normalized) address is matched consistently. The address is trimmed
 * here; lower-casing happens through {@link normalizeEmail}, exactly as it does
 * for registration, so the two paths cannot drift.
 *
 * Unknown fields are rejected (`.strict()`), which is what makes supplying a
 * `userId`, `organizationId` or `role` in the body a `400` rather than a silent
 * privilege attempt: the organization is taken from the authorized route and
 * the role is always `MEMBER`.
 */
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
