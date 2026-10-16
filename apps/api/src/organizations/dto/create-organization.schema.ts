import { z } from 'zod';

const NAME_MAX_LENGTH = 100;

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
