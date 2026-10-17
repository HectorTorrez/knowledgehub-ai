import { describe, expect, it, vi } from 'vitest';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EmbeddingResponseError,
  EmbeddingUnavailableError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  MAX_RETRIEVAL_LIMIT,
  RetrievalQueryError,
} from './retrieval-policy.js';
import { RetrievalService } from './retrieval.service.js';

interface QueryTagCall {
  strings: TemplateStringsArray;
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
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings, values });
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
    ).resolves.toEqual([MATCH]);

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
      5,
    ]);
  });

  it('defaults the limit when none is requested', async () => {
    const { service, calls } = createService([]);

    await service.search({ organizationId: 'org-1', text: 'alpha' });

    expect(calls[0]!.values.at(-1)).toBe(DEFAULT_RETRIEVAL_LIMIT);
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

    const nonFinite = createService([], async () => [
      [Number.NaN, 0, 0, 0],
    ]);
    await expect(
      nonFinite.service.search({ organizationId: 'org-1', text: 'alpha' }),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);
  });
});
