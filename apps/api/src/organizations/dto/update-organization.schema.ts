import { z } from 'zod';

const NAME_MAX_LENGTH = 100;

export const updateOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'name is required')
      .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`),
  })
  .strict();

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
