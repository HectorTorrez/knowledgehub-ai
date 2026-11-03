import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SummariesService } from './summaries.service.js';

const target = { organizationId: 'org', documentId: 'doc', documentGeneration: 2 };
const chunks = [{ chunkIndex: 0, pageNumber: 1, content: 'text' }];

function setup(enabled = true) {
  const tx = { $queryRaw: vi.fn(async () => [] as { id: string }[]), documentSummary: { upsert: vi.fn() }, document: { updateMany: vi.fn() } };
  const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<void>) => fn(tx)), document: { updateMany: vi.fn() } };
  const summarizer = { summarize: vi.fn(async () => ({ summary: 'summary', keyTopics: [] })) };
  const config = { get: (key: string) => key === 'SUMMARIES_ENABLED' ? (enabled ? 'true' : 'false') : undefined, getOrThrow: () => 'model' };
  return { service: new SummariesService(config as unknown as ConfigService, prisma as unknown as PrismaService, summarizer), tx, prisma, summarizer };
}

describe('SummariesService', () => {
  it('does not publish when the generation or tenant no longer matches', async () => {
    const { service, tx } = setup();
    await service.summarize(target, chunks);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.documentSummary.upsert).not.toHaveBeenCalled();
    expect(tx.document.updateMany).not.toHaveBeenCalled();
  });

  it('records provider failures against the target generation and tenant', async () => {
    const { service, prisma, summarizer } = setup();
    summarizer.summarize.mockRejectedValue(new Error('failed'));
    await service.summarize(target, chunks);
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'doc', organizationId: 'org', generation: 2 }), data: expect.objectContaining({ summaryStatus: 'FAILED' }) }));
  });

  it('does nothing when disabled', async () => {
    const { service, summarizer, prisma } = setup(false);
    await service.summarize(target, chunks);
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
