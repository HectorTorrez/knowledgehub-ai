import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationSummary,
} from '@knowledgehub/shared-types';
import {
  decodeListCursor,
  encodeListCursor,
  listCursorFilter,
} from '../common/list-cursor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListConversationsInput } from './dto/list-conversations.schema.js';

const CONVERSATION_SELECT = { id: true, createdAt: true } as const;

interface ConversationProjection {
  id: string;
  createdAt: Date;
}

function toConversationSummary(
  row: ConversationProjection,
): ConversationSummary {
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string): Promise<ConversationDetailResponse> {
    const row = await this.prisma.conversation.create({
      data: { organizationId },
      select: CONVERSATION_SELECT,
    });

    return { conversation: toConversationSummary(row) };
  }

  async list(
    organizationId: string,
    input: ListConversationsInput,
  ): Promise<ConversationListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    const rows = await this.prisma.conversation.findMany({
      where: {
        organizationId,
        ...(cursor ? listCursorFilter(cursor) : {}),
      },
      select: CONVERSATION_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeListCursor(page[page.length - 1]) : null;

    return {
      conversations: page.map(toConversationSummary),
      nextCursor,
    };
  }

  async getDetail(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponse> {
    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: CONVERSATION_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Conversation not found');
    }

    return { conversation: toConversationSummary(row) };
  }

  async delete(organizationId: string, conversationId: string): Promise<void> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, organizationId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }
}
