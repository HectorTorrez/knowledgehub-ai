import type { OrganizationRole } from '@knowledgehub/shared-types';

const ROLE_RANK: Record<OrganizationRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
  VIEWER: 0,
};

export function needsRoleChangeConfirmation(
  from: OrganizationRole,
  to: OrganizationRole,
): boolean {
  return to === 'OWNER' || ROLE_RANK[to] < ROLE_RANK[from];
}
