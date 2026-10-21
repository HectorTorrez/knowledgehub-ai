import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { FactsConfig } from '../facts/facts.config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AggregationService } from './aggregation.service.js';
import type { ContractTotalsInput } from './dto/contract-totals.schema.js';

const INPUT: ContractTotalsInput = { limit: 50, offset: 0 };

function fact(overrides: Record<string, unknown>) {
  return {
    factId: 'fact-1',
    naturalKey: '1143',
    label: 'Plan Personalizado',
    amountMinor: 50000n,
    scale: 2,
    currency: 'USD',
    pageNumber: 1,
    chunkIndex: 0,
    evidenceText: '1143 Plan Personalizado $500.00',
    documentId: 'doc-a',
    documentTitle: 'Contracts',
    documentCreatedAt: new Date('2026-07-28T00:00:00Z'),
    ...overrides,
  };
}

function createService(options: {
  enabled?: boolean;
  documents?: Array<{ id: string; factsStatus: string }>;
  document?: { status: string } | null;
  facts?: Array<Record<string, unknown>>;
} = {}) {
  const prisma = {
    document: {
      findMany: vi.fn(async () => options.documents ?? []),
      findFirst: vi.fn(async () =>
        options.document === undefined ? { status: 'READY' } : options.document,
      ),
    },
    $queryRaw: vi.fn(async () => options.facts ?? []),
  };

  const config = { enabled: options.enabled ?? true } as unknown as FactsConfig;

  return {
    service: new AggregationService(
      prisma as unknown as PrismaService,
      config,
    ),
    prisma,
  };
}

describe('AggregationService', () => {
  it('refuses to aggregate when the feature is disabled', async () => {
    const { service } = createService({ enabled: false });

    await expect(service.contractTotals('org-1', INPUT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns 404 for a document outside the organization', async () => {
    const { service } = createService({ document: null });

    await expect(
      service.contractTotals('org-1', { ...INPUT, documentId: 'doc-foreign' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 for a document that is not ready', async () => {
    const { service } = createService({ document: { status: 'PROCESSING' } });

    await expect(
      service.contractTotals('org-1', { ...INPUT, documentId: 'doc-a' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sums each currency independently', async () => {
    const { service } = createService({
      documents: [
        { id: 'doc-a', factsStatus: 'READY' },
        { id: 'doc-b', factsStatus: 'READY' },
      ],
      facts: [
        fact({ naturalKey: '1143', amountMinor: 50000n }),
        fact({ naturalKey: '1142', amountMinor: 10000n }),
        fact({
          naturalKey: '2001',
          amountMinor: 20000n,
          currency: 'EUR',
          documentId: 'doc-b',
        }),
      ],
    });

    const result = await service.contractTotals('org-1', INPUT);

    expect(result.status).toBe('complete');
    expect(result.coverage).toEqual({
      documents: 2,
      extracted: 2,
      failed: 0,
      pending: 0,
    });
    expect(result.totals).toEqual([
      { currency: 'EUR', scale: 2, totalMinor: '20000', contractCount: 1 },
      { currency: 'USD', scale: 2, totalMinor: '60000', contractCount: 2 },
    ]);
    expect(result.totalFacts).toBe(3);
    expect(result.sources).toEqual([
      expect.objectContaining({
        documentId: 'doc-a',
        currency: 'USD',
        subtotalMinor: '60000',
        contractCount: 2,
      }),
      expect.objectContaining({
        documentId: 'doc-b',
        currency: 'EUR',
        subtotalMinor: '20000',
        contractCount: 1,
      }),
    ]);
  });

  it('keeps the total but marks it partial when a document failed extraction', async () => {
    const { service } = createService({
      documents: [
        { id: 'doc-a', factsStatus: 'READY' },
        { id: 'doc-b', factsStatus: 'FAILED' },
      ],
      facts: [fact({})],
    });

    const result = await service.contractTotals('org-1', INPUT);

    expect(result.status).toBe('partial');
    expect(result.coverage.failed).toBe(1);
    expect(result.totals[0]?.totalMinor).toBe('50000');
  });

  it('collapses a contract repeated across documents, keeping the newest', async () => {
    const { service } = createService({
      documents: [
        { id: 'doc-b', factsStatus: 'READY' },
        { id: 'doc-a', factsStatus: 'READY' },
      ],
      facts: [
        fact({
          documentId: 'doc-b',
          amountMinor: 99900n,
          documentCreatedAt: new Date('2026-08-01T00:00:00Z'),
        }),
        fact({
          documentId: 'doc-a',
          amountMinor: 50000n,
          documentCreatedAt: new Date('2026-07-28T00:00:00Z'),
        }),
      ],
    });

    const result = await service.contractTotals('org-1', INPUT);

    expect(result.collapsedDuplicates).toBe(1);
    expect(result.totalFacts).toBe(1);
    expect(result.totals[0]?.totalMinor).toBe('99900');
  });

  it('paginates the breakdown without truncating the totals', async () => {
    const { service } = createService({
      documents: [{ id: 'doc-a', factsStatus: 'READY' }],
      facts: [
        fact({ naturalKey: '1', amountMinor: 100n }),
        fact({ naturalKey: '2', amountMinor: 200n }),
        fact({ naturalKey: '3', amountMinor: 300n }),
      ],
    });

    const result = await service.contractTotals('org-1', {
      limit: 1,
      offset: 1,
    });

    expect(result.totalFacts).toBe(3);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]?.contractId).toBe('2');
    expect(result.totals[0]?.totalMinor).toBe('600');
  });

  it('returns a complete zero total for an empty scope', async () => {
    const { service } = createService({ documents: [], facts: [] });

    const result = await service.contractTotals('org-1', INPUT);

    expect(result).toMatchObject({
      status: 'complete',
      coverage: { documents: 0, extracted: 0, failed: 0, pending: 0 },
      collapsedDuplicates: 0,
      totalFacts: 0,
      totals: [],
      breakdown: [],
    });
  });

  it('scopes every read by the organization', async () => {
    const { service, prisma } = createService({ facts: [] });

    await service.contractTotals('org-1', INPUT);

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );

    const calls = prisma.$queryRaw.mock.calls as unknown as Array<
      [TemplateStringsArray, ...unknown[]]
    >;
    const [strings, ...values] = calls[0]!;
    expect(strings.join('?')).toContain('f."organizationId" = ?');
    expect(strings.join('?')).toContain('d."organizationId" = ?');
    expect(values).toContain('org-1');
  });
});
