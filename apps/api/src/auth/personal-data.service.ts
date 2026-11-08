import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const answerFields = {
  question: true,
  answer: true,
  status: true,
  citations: true,
  createdAt: true,
} as const;

@Injectable()
export class PersonalDataService {
  constructor(private readonly prisma: PrismaService) {}

  async export(userId: string) {
    const [profile, memberships, conversations, answers, feedback] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.membership.findMany({
          where: { userId },
          select: {
            organizationId: true,
            role: true,
            createdAt: true,
            organization: { select: { name: true } },
          },
        }),
        this.prisma.unscoped.conversation.findMany({
          where: { createdById: userId },
          select: {
            id: true,
            organizationId: true,
            title: true,
            visibility: true,
            createdAt: true,
            answers: { select: answerFields, orderBy: { createdAt: 'asc' } },
          },
        }),
        this.prisma.unscoped.answer.findMany({
          where: { askedById: userId, conversationId: null },
          select: answerFields,
        }),
        this.prisma.answerFeedback.findMany({
          where: { userId },
          select: {
            answerId: true,
            value: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);
    if (!profile)
      throw new UnauthorizedException('Session is no longer active');
    return {
      profile,
      memberships: memberships.map(
        ({ organizationId, organization, role, createdAt }) => ({
          organizationId,
          name: organization.name,
          role,
          joinedAt: createdAt,
        }),
      ),
      conversations,
      answers,
      feedback,
    };
  }
}
