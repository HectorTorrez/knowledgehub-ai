import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function buildService(options: {
  create?: (args?: unknown) => Promise<unknown>;
  findMany?: (args?: unknown) => Promise<unknown>;
  findFirst?: (args?: unknown) => Promise<unknown>;
  deleteMany?: (args?: unknown) => Promise<unknown>;
} = {}) {
  const prisma = {
    conversation: {
      create: vi.fn(
        options.create ??
          (async () => ({ id: 'c1', title: null, createdAt: CREATED_AT })),
      ),
      findMany: vi.fn(options.findMany ?? (async () => [] as unknown[])),
      findFirst: vi.fn(options.findFirst ?? (async () => null as unknown)),
      deleteMany: vi.fn(options.deleteMany ?? (async () => ({ count: 1 }))),
    },
  } as unknown as PrismaService;

  return { service: new ConversationsService(prisma), prisma };
}

describe('ConversationsService', () => {
  it('creates a conversation for the organization', async () => {
    const { service, prisma } = buildService();

    const result = await service.create('org-1');

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1' },
      select: { id: true, title: true, createdAt: true },
    });
    expect(result).toEqual({
      conversation: {
        id: 'c1',
        title: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('looks up a detail by id and organization', async () => {
    const { service, prisma } = buildService({
      findFirst: async () => ({ id: 'c1', title: 'Alpha', createdAt: CREATED_AT }),
    });

    await service.getDetail('org-1', 'c1');

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', organizationId: 'org-1' },
      select: { id: true, title: true, createdAt: true },
    });
  });

  it('returns 404 when the conversation is not in the organization', async () => {
    const { service } = buildService({ findFirst: async () => null });

    await expect(service.getDetail('org-1', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes a conversation scoped to the organization', async () => {
    const { service, prisma } = buildService();

    await service.delete('org-1', 'c1');

    expect(prisma.conversation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c1', organizationId: 'org-1' },
    });
  });

  it('returns 404 when deleting a conversation that is not in the organization', async () => {
    const { service } = buildService({ deleteMany: async () => ({ count: 0 }) });

    await expect(service.delete('org-1', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
