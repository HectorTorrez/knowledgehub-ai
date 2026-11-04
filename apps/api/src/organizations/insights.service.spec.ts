import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import { InsightsService } from './insights.service.js';

const context: OrganizationContext = {
  organizationId: 'org',
  userId: 'user',
  role: 'OWNER',
  organization: {
    id: 'org',
    name: 'Org',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe('InsightsService', () => {
  it('rejects non-owners before querying insights', async () => {
    const prisma = {
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER' }) },
      answer: { count: vi.fn() },
    };
    const service = new InsightsService(prisma as unknown as PrismaService);
    await expect(service.get(context, 30)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.answer.count).not.toHaveBeenCalled();
  });

  it('scopes window and limits to the organization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    try {
      const prisma = {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }),
        },
        answer: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
        answerFeedback: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      const service = new InsightsService(prisma as unknown as PrismaService);
      await service.get(context, 7);
      const since = new Date('2026-01-25T00:00:00Z');
      expect(prisma.answer.count).toHaveBeenCalledWith({
        where: { organizationId: 'org', createdAt: { gte: since } },
      });
      const readable = {
        OR: [
          { conversationId: null },
          {
            conversation: {
              OR: [{ createdById: 'user' }, { visibility: 'ORGANIZATION' }],
            },
          },
        ],
      };
      expect(prisma.answer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org',
            createdAt: { gte: since },
            status: 'insufficient_evidence',
            AND: [readable],
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(prisma.answerFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: { gte: since },
            value: 'DOWN',
            answer: { organizationId: 'org', AND: [readable] },
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
