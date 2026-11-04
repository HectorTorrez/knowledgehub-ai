import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { resolveCollectionScope } from './resolve-collection-scope.js';

describe('resolveCollectionScope', () => {
  it('validates collection ownership and intersects the document scope', async () => {
    const prisma = {
      collection: { count: vi.fn().mockResolvedValue(1) },
      document: { findMany: vi.fn().mockResolvedValue([{ id: 'doc' }]) },
    };
    await expect(
      resolveCollectionScope(
        prisma as unknown as PrismaService,
        'org',
        ['collection', 'collection'],
        ['doc'],
      ),
    ).resolves.toEqual(['doc']);
    expect(prisma.collection.count).toHaveBeenCalledWith({
      where: { organizationId: 'org', id: { in: ['collection'] } },
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        collections: {
          some: { organizationId: 'org', collectionId: { in: ['collection'] } },
        },
        id: { in: ['doc'] },
      },
      select: { id: true },
    });
  });

  it('rejects foreign or missing collections', async () => {
    const prisma = {
      collection: { count: vi.fn().mockResolvedValue(0) },
      document: { findMany: vi.fn() },
    };
    await expect(
      resolveCollectionScope(prisma as unknown as PrismaService, 'org', [
        'foreign',
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});
