import { z } from 'zod';

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['OWNER', 'MEMBER'], {
      error: 'role must be OWNER or MEMBER',
    }),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
