import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FactsStore } from './facts.store.js';

function createStore() {
  const prisma = {
    documentExtraction: { findFirst: vi.fn(async () => null) },
    documentChunk: { findMany: vi.fn(async () => []) },
  };

  return {
    store: new FactsStore(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('FactsStore', () => {
  it('loads pages only within the document organization', async () => {
    const { store, prisma } = createStore();

    await store.loadPages('org-1', 'doc-1', 2);

    expect(prisma.documentExtraction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          documentId: 'doc-1',
          documentGeneration: 2,
        },
      }),
    );
  });

  it('loads chunks only within the document organization', async () => {
    const { store, prisma } = createStore();

    await store.loadChunks('org-1', 'doc-1', 2);

    expect(prisma.documentChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          documentId: 'doc-1',
          documentGeneration: 2,
        },
      }),
    );
  });
});
