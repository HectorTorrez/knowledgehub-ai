import { z } from 'zod';

/**
 * Request contract for `PATCH /organizations/:organizationId/members/:userId`.
 *
 * Only `role` is accepted and it is restricted to the two roles the product
 * models. The target user comes from the route and the organization from the
 * authorized context, so neither is part of the body. Unknown fields are
 * rejected (`.strict()`), which is what makes a client-supplied `userId` or
 * `organizationId` a `400` instead of a silent attempt to retarget the write.
 */
export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['OWNER', 'MEMBER'], {
      error: 'role must be OWNER or MEMBER',
    }),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
