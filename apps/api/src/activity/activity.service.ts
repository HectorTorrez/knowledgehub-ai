import { Injectable } from '@nestjs/common';
import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type ActivityRow = Prisma.OrganizationActivityGetPayload<{
  include: { actor: { select: { id: true; firstName: true; lastName: true; email: true } } };
}>;

type ActivityEntry = {
  organizationId: string;
  actorId: string;
  action: OrganizationActivityItem['action'];
  targetType: string;
  targetId: string | null;
  metadata: Record<string, string>;
};

export function toActivityDto(row: ActivityRow): OrganizationActivityItem {
  const metadata: Record<string, string> = {};
  if (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) {
    for (const [key, value] of Object.entries(row.metadata)) {
      if (typeof value === 'string') metadata[key] = value;
    }
  }
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ActivityService {
  async record(client: PrismaService | Prisma.TransactionClient, entry: ActivityEntry): Promise<void> {
    await client.organizationActivity.create({ data: entry });
  }
}
