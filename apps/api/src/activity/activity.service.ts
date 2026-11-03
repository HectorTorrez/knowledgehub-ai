import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrganizationActivityItem, OrganizationActivityListResponse } from '@knowledgehub/shared-types';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { decodeListCursor, encodeListCursor, listCursorFilter } from '../common/list-cursor.js';
import { requireCapability } from '../organizations/require-owner.js';
import type { OrganizationContext } from '../organizations/organization-context.js';

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
  constructor(private readonly prisma: PrismaService) {}

  async list(context: OrganizationContext, input: { cursor?: string; limit: number }): Promise<OrganizationActivityListResponse> {
    await requireCapability(this.prisma, context, 'organization.manage', 'view activity');
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) throw new BadRequestException('cursor is not valid');
    const rows = await this.prisma.organizationActivity.findMany({
      where: { organizationId: context.organizationId, ...(cursor ? listCursorFilter(cursor) : {}) },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return { activities: page.map(toActivityDto), nextCursor: hasMore ? encodeListCursor(page[page.length - 1]!) : null };
  }

  async record(client: PrismaService | Prisma.TransactionClient, entry: ActivityEntry): Promise<void> {
    await client.organizationActivity.create({ data: entry });
  }
}
