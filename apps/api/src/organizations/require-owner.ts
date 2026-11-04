import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { can, type Capability, type PolicyRole } from './permissions.js';
import type { OrganizationContext } from './organization-context.js';

export async function requireCapability(
  tx: Prisma.TransactionClient,
  context: Pick<OrganizationContext, 'userId' | 'organizationId'>,
  capability: Capability,
  action: string,
): Promise<PolicyRole> {
  const actor = await tx.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: context.userId,
        organizationId: context.organizationId,
      },
    },
    select: { role: true },
  });

  if (!actor || !can(actor.role, capability)) {
    throw new ForbiddenException(`You cannot ${action}`);
  }
  return actor.role;
}

export async function requireOwner(
  tx: Prisma.TransactionClient,
  context: Pick<OrganizationContext, 'userId' | 'organizationId'>,
  action: string,
): Promise<void> {
  await requireCapability(tx, context, 'owners.manage', action);
}
