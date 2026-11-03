import { Injectable } from '@nestjs/common';
import type { KnowledgeInsightsResponse } from '@knowledgehub/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import { requireOwner } from './organizations.service.js';

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(context: OrganizationContext, days: number): Promise<KnowledgeInsightsResponse> {
    await requireOwner(this.prisma, context, 'view insights');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const answerWhere = { organizationId: context.organizationId, createdAt: { gte: since } };
    const feedbackWhere = { answer: { organizationId: context.organizationId }, createdAt: { gte: since } };
    const [questionsAsked, answered, insufficientEvidence, helpfulFeedback, unhelpfulFeedback, unanswered, negative] = await Promise.all([
      this.prisma.answer.count({ where: answerWhere }),
      this.prisma.answer.count({ where: { ...answerWhere, status: 'answered' } }),
      this.prisma.answer.count({ where: { ...answerWhere, status: 'insufficient_evidence' } }),
      this.prisma.answerFeedback.count({ where: { ...feedbackWhere, value: 'UP' } }),
      this.prisma.answerFeedback.count({ where: { ...feedbackWhere, value: 'DOWN' } }),
      this.prisma.answer.findMany({ where: { ...answerWhere, status: 'insufficient_evidence' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, question: true, createdAt: true, conversationId: true } }),
      this.prisma.answerFeedback.findMany({ where: { ...feedbackWhere, value: 'DOWN' }, orderBy: { createdAt: 'desc' }, take: 20, select: { answerId: true, comment: true, createdAt: true, answer: { select: { question: true } } } }),
    ]);
    return {
      totals: { questionsAsked, answered, insufficientEvidence, helpfulFeedback, unhelpfulFeedback },
      unansweredQuestions: unanswered.map((a) => ({ answerId: a.id, question: a.question, askedAt: a.createdAt.toISOString(), conversationId: a.conversationId })),
      negativeFeedback: negative.map((f) => ({ answerId: f.answerId, question: f.answer.question, comment: f.comment, createdAt: f.createdAt.toISOString() })),
    };
  }
}
