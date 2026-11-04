import { describe, expect, it, vi } from 'vitest';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EmbeddingResponseError,
  EmbeddingUnavailableError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  MAX_RETRIEVAL_LIMIT,
  RetrievalQueryError,
} from './retrieval-policy.js';
import { RetrievalService } from './retrieval.service.js';

interface QueryTagCall {
  strings: readonly string[];
  values: unknown[];
}

const DIMENSIONS = 4;

const vector = (value: number): number[] =>
  Array.from({ length: DIMENSIONS }, () => value);

const MATCH = {
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Report',
  pageNumber: 2,
  chunkIndex: 3,
  content: 'alpha',
  similarity: 0.87,
};

function sqlOf(call: QueryTagCall): string {
  return call.strings.join('?');
}

function createService(
  rows: unknown[],
  embed: EmbeddingProvider['embed'] = async () => [vector(1)],
) {
  const embeddings: EmbeddingProvider = { embed: vi.fn(embed) };
  const calls: QueryTagCall[] = [];
  const queryRaw = vi.fn(
    async (query: { strings: readonly string[]; values: unknown[] }) => {
      calls.push(query);
      return rows;
    },
  );

  const service = new RetrievalService(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    { dimensions: DIMENSIONS } as EmbeddingConfig,
    embeddings,
  );

  return { service, embeddings, calls, queryRaw };
}

describe('RetrievalService', () => {
  it('embeds the query text and maps the matching chunks', async () => {
    const { service, embeddings } = createService([MATCH]);

    await expect(
      service.search({ organizationId: 'org-1', text: 'what is alpha' }),
    ).resolves.toEqual([{ ...MATCH, relevance: 1, matchedLexically: true }]);

    expect(embeddings.embed).toHaveBeenCalledWith(['what is alpha']);
  });

  it('scopes the search to the organization, READY documents and the current generation', async () => {
    const { service, calls } = createService([]);

    await service.search({ organizationId: 'org-1', text: 'alpha' });

    const sql = sqlOf(calls[0]!);
    expect(sql).toContain('c."organizationId" = ?::uuid');
    expect(sql).toContain('d."organizationId" = ?::uuid');
    expect(sql).toContain("d.status = 'READY'");
    expect(sql).toContain('d.generation = c."documentGeneration"');
  });

  it('scopes the search to a single document when one is requested', async () => {
    const { service, calls } = createService([]);

    await service.search({
      organizationId: 'org-1',
      text: 'alpha',
      documentId: 'doc-9',
    });

    const sql = sqlOf(calls[0]!);
    expect(sql).toContain('c."documentId" = ?::uuid');
    expect(calls[0]!.values).toContain('doc-9');
  });

  it('applies document and date filters alongside tenant scope in both legs', async () => {
    const { service, calls } = createService([]);
    await service.search({
      organizationId: 'org-1',
      text: 'alpha',
      documentIds: ['doc-1', 'doc-2'],
      createdAfter: '2026-01-01',
      createdBefore: '2026-01-31',
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(sqlOf(call)).toContain('c."organizationId" = ?::uuid');
      expect(sqlOf(call)).toContain('d."organizationId" = ?::uuid');
      expect(sqlOf(call)).toContain('c."documentId" IN (?::uuid,?::uuid)');
      expect(sqlOf(call)).toContain('d."createdAt" >= ?');
      expect(sqlOf(call)).toContain('d."createdAt" < ?');
      expect(call.values).toContainEqual(new Date('2026-02-01T00:00:00Z'));
    }
  });

  it('omits the document filter when no document is requested', async () => {
    const { service, calls } = createService([]);

    await service.search({ organizationId: 'org-1', text: 'alpha' });

    expect(sqlOf(calls[0]!)).not.toContain('c."documentId" =');
  });

  it('orders matches by cosine distance and applies the limit', async () => {
    const { service, calls } = createService([]);

    await service.search({ organizationId: 'org-1', text: 'alpha', limit: 5 });

    const sql = sqlOf(calls[0]!);
    expect(sql).toContain('c."embedding" <=> ?::vector');
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('LIMIT ?');
    expect(calls[0]!.values).toEqual([
      '[1,1,1,1]',
      'org-1',
      'org-1',
      '[1,1,1,1]',
      40,
    ]);
  });

  it('defaults the limit when none is requested', async () => {
    const { service, calls } = createService([]);

    await service.search({ organizationId: 'org-1', text: 'alpha' });

    expect(calls[0]!.values.at(-1)).toBe(40);
  });

  it('rejects a blank query and an out-of-range limit without embedding', async () => {
    const { service, embeddings, queryRaw } = createService([]);

    await expect(
      service.search({ organizationId: 'org-1', text: '   ' }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);

    await expect(
      service.search({ organizationId: 'org-1', text: 'alpha', limit: 0 }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);

    await expect(
      service.search({
        organizationId: 'org-1',
        text: 'alpha',
        limit: MAX_RETRIEVAL_LIMIT + 1,
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('propagates a provider failure without querying', async () => {
    const { service, queryRaw } = createService([], async () => {
      throw new EmbeddingUnavailableError('down');
    });

    await expect(
      service.search({ organizationId: 'org-1', text: 'alpha' }),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a query embedding that is not a single usable vector', async () => {
    const wrongCount = createService([], async () => []);
    await expect(
      wrongCount.service.search({ organizationId: 'org-1', text: 'alpha' }),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);

    const wrongDimension = createService([], async () => [[1, 2, 3]]);
    await expect(
      wrongDimension.service.search({ organizationId: 'org-1', text: 'alpha' }),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);

    const nonFinite = createService([], async () => [[Number.NaN, 0, 0, 0]]);
    await expect(
      nonFinite.service.search({ organizationId: 'org-1', text: 'alpha' }),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);
  });
});
