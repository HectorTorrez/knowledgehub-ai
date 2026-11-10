import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  KnowledgeGapTask,
  UpdateKnowledgeGapRequest,
} from '@knowledgehub/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { readableAnswerWhere } from '../answers/conversation-policy.js';
import type { OrganizationContext } from './organization-context.js';
import { requireCapability } from './require-owner.js';

@Injectable()
export class KnowledgeGapsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: OrganizationContext,
  ): Promise<{ tasks: KnowledgeGapTask[] }> {
    await requireCapability(
      this.prisma,
      context,
      'insights.view',
      'view knowledge gaps',
    );
    const rows = await this.prisma.knowledgeGap.findMany({
      where: {
        organizationId: context.organizationId,
        answer: readableAnswerWhere(context.userId),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: { answer: { select: { question: true } } },
    });
    return {
      tasks: rows.map((row) => ({
        id: row.id,
        answerId: row.answerId,
        question: row.answer.question,
        status: row.status,
        assigneeId: row.assigneeId,
        documentId: row.documentId,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async save(
    context: OrganizationContext,
    answerId: string,
    input: UpdateKnowledgeGapRequest,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await requireCapability(
        tx,
        context,
        'insights.view',
        'manage knowledge gaps',
      );
      const answer = await tx.answer.findFirst({
        where: {
          id: answerId,
          organizationId: context.organizationId,
          AND: [readableAnswerWhere(context.userId)],
        },
        select: {
          id: true,
          status: true,
          feedback: { where: { value: 'DOWN' }, take: 1, select: { id: true } },
        },
      });
      if (!answer) throw new NotFoundException('Answer not found');
      if (
        answer.status !== 'insufficient_evidence' &&
        answer.feedback.length === 0
      )
        throw new BadRequestException(
          'Only unanswered or negatively rated answers can become knowledge gaps',
        );
      if (
        input.assigneeId &&
        !(await tx.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: input.assigneeId,
              organizationId: context.organizationId,
            },
          },
        }))
      )
        throw new NotFoundException('Assignee not found');
      if (
        input.documentId &&
        !(await tx.document.findFirst({
          where: {
            id: input.documentId,
            organizationId: context.organizationId,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Document not found');
      if (input.status === 'RESOLVED' && !input.documentId)
        throw new BadRequestException('A resolving document is required');
      await tx.knowledgeGap.upsert({
        where: { answerId },
        create: { organizationId: context.organizationId, answerId, ...input },
        update: input,
      });
    });
  }
}
