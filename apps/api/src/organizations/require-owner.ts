import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { can } from './permissions.js';
import type { OrganizationContext } from './organization-context.js';

export async function requireOwner(
  tx: Prisma.TransactionClient,
  context: Pick<OrganizationContext, 'userId' | 'organizationId'>,
  action: string,
): Promise<void> {
  const actor = await tx.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: context.userId,
        organizationId: context.organizationId,
      },
    },
    select: { role: true },
  });

  if (!actor || !can(actor.role, 'owners.manage')) {
    throw new ForbiddenException(`Only an organization owner can ${action}`);
  }
}

