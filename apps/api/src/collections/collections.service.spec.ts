import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CollectionsService } from './collections.service.js';

describe('CollectionsService', () => {
  it('replaces memberships within a transaction', async () => {
    const tx = { document: { findFirst: vi.fn().mockResolvedValue({ id: 'doc' }) }, collection: { count: vi.fn().mockResolvedValue(1) }, documentCollection: { deleteMany: vi.fn(), createMany: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
    const service = new CollectionsService(prisma as unknown as PrismaService, {} as ActivityService);
    await service.setDocumentCollections('org', 'doc', ['collection', 'collection']);
    expect(tx.documentCollection.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org', documentId: 'doc' } });
    expect(tx.documentCollection.createMany).toHaveBeenCalledWith({ data: [{ organizationId: 'org', documentId: 'doc', collectionId: 'collection' }] });
  });

  it('does not alter memberships when a collection is foreign', async () => {
    const tx = { document: { findFirst: vi.fn().mockResolvedValue({ id: 'doc' }) }, collection: { count: vi.fn().mockResolvedValue(0) }, documentCollection: { deleteMany: vi.fn(), createMany: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
    const service = new CollectionsService(prisma as unknown as PrismaService, {} as ActivityService);
    await expect(service.setDocumentCollections('org', 'doc', ['foreign'])).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.documentCollection.deleteMany).not.toHaveBeenCalled();
  });
});
