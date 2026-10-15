import { z } from 'zod';

const NAME_MAX_LENGTH = 100;

/**
 * Request contract for `POST /organizations`.
 *
 * The name is trimmed before the bounds are applied, so surrounding whitespace
 * never counts toward the length and a whitespace-only name is rejected as
 * empty. Unknown fields are rejected (`.strict()`), matching the auth schemas.
 */
export const createOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'name is required')
      .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
