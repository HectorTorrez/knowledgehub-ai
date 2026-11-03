import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationListScope,
  ConversationSummary,
  ConversationVisibility,
} from '@knowledgehub/shared-types';
import { ActivityService } from '../activity/activity.service.js';
import {
  decodeListCursor,
  encodeListCursor,
  listCursorFilter,
} from '../common/list-cursor.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  canShareConversation,
  conversationPermissions,
  manageableConversationWhere,
  readableConversationWhere,
  type ConversationActor,
} from './conversation-policy.js';
import type { ListConversationsInput } from './dto/list-conversations.schema.js';

const CONVERSATION_SELECT = {
  id: true,
  title: true,
  createdAt: true,
  visibility: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

interface ConversationProjection {
  id: string;
  title: string | null;
  createdAt: Date;
  visibility: ConversationVisibility;
  createdById: string | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ConversationScope {
  organizationId: string;
  actor: ConversationActor;
}

function toConversationSummary(
  row: ConversationProjection,
  actor: ConversationActor,
): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    visibility: row.visibility,
    createdBy: row.createdBy,
    ...conversationPermissions(row, actor),
  };
}

function scopeWhere(
  scope: ConversationListScope,
  actor: ConversationActor,
): Prisma.ConversationWhereInput {
  if (scope === 'mine') return { createdById: actor.userId };
  if (scope === 'shared') {
    return {
      visibility: 'ORGANIZATION',
      OR: [{ createdById: null }, { createdById: { not: actor.userId } }],
    };
  }
  return {};
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create({
    organizationId,
    actor,
  }: ConversationScope): Promise<ConversationDetailResponse> {
    const row = await this.prisma.conversation.create({
      data: { organizationId, createdById: actor.userId },
      select: CONVERSATION_SELECT,
    });

    return { conversation: toConversationSummary(row, actor) };
  }

  async list(
    { organizationId, actor }: ConversationScope,
    input: ListConversationsInput,
  ): Promise<ConversationListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    const rows = await this.prisma.conversation.findMany({
      where: {
        organizationId,
        AND: [
          readableConversationWhere(actor.userId),
          scopeWhere(input.scope, actor),
          ...(cursor ? [listCursorFilter(cursor)] : []),
        ],
      },
      select: CONVERSATION_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeListCursor(page[page.length - 1])
        : null;

    return {
      conversations: page.map((row) => toConversationSummary(row, actor)),
      nextCursor,
    };
  }

  async getDetail(
    scope: ConversationScope,
    conversationId: string,
  ): Promise<ConversationDetailResponse> {
    const row = await this.findReadable(scope, conversationId);
    return { conversation: toConversationSummary(row, scope.actor) };
  }

  async getExport(scope: ConversationScope, conversationId: string) {
    const row = await this.findReadable(scope, conversationId);
    const turns = await this.prisma.answer.findMany({
      where: { organizationId: scope.organizationId, conversationId },
      select: {
        question: true,
        answer: true,
        status: true,
        citations: true,
        missing: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { title: row.title, turns };
  }

  async setVisibility(
    scope: ConversationScope,
    conversationId: string,
    visibility: ConversationVisibility,
  ): Promise<ConversationDetailResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.conversation.findFirst({
        where: {
          id: conversationId,
          organizationId: scope.organizationId,
          AND: [readableConversationWhere(scope.actor.userId)],
        },
        select: CONVERSATION_SELECT,
      });

      if (!current || !canShareConversation(current, scope.actor)) {
        throw new NotFoundException('Conversation not found');
      }

      if (current.visibility === visibility) {
        return current;
      }

      const updated = await tx.conversation.update({
        where: { id: conversationId },
        data: { visibility },
        select: CONVERSATION_SELECT,
      });

      await this.activity.record(tx, {
        organizationId: scope.organizationId,
        actorId: scope.actor.userId,
        action:
          visibility === 'ORGANIZATION'
            ? 'CONVERSATION_SHARED'
            : 'CONVERSATION_UNSHARED',
        targetType: 'conversation',
        targetId: conversationId,
        metadata: updated.title ? { title: updated.title } : {},
      });

      return updated;
    });

    return { conversation: toConversationSummary(row, scope.actor) };
  }

  async delete(scope: ConversationScope, conversationId: string): Promise<void> {
    const result = await this.prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        organizationId: scope.organizationId,
        AND: [manageableConversationWhere(scope.actor)],
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  private async findReadable(
    { organizationId, actor }: ConversationScope,
    conversationId: string,
  ): Promise<ConversationProjection> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
        AND: [readableConversationWhere(actor.userId)],
      },
      select: CONVERSATION_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Conversation not found');
    }

    return row;
  }
}
