import { z } from 'zod';

const NAME_MAX_LENGTH = 100;

export const updateProfileSchema = z
  .object({
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

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
