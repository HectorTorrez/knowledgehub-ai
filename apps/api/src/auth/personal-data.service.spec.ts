import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PersonalDataService } from './personal-data.service.js';

describe('PersonalDataService', () => {
  it('scopes personal records to the caller and excludes credentials', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user' }) },
      membership: { findMany: vi.fn().mockResolvedValue([]) },
      unscoped: {
        conversation: { findMany: vi.fn().mockResolvedValue([]) },
        answer: { findMany: vi.fn().mockResolvedValue([]) },
      },
      answerFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new PersonalDataService(prisma as unknown as PrismaService);
    await service.export('user');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ passwordHash: true }),
      }),
    );
    expect(prisma.unscoped.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdById: 'user' } }),
    );
    expect(prisma.unscoped.answer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { askedById: 'user', conversationId: null },
      }),
    );
    expect(prisma.answerFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user' } }),
    );
  });
});
