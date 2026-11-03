import { z } from 'zod';

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
