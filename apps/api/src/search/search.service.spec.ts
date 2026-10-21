import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import { RetrievalQueryError } from '../retrieval/retrieval-policy.js';
import type {
  RetrievedChunk,
  RetrievalService,
} from '../retrieval/retrieval.service.js';
import { SearchService } from './search.service.js';

const CHUNK: RetrievedChunk = {
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Architecture Notes',
  pageNumber: 2,
  chunkIndex: 4,
  content: 'Retries are bounded by maxAttempts.',
  similarity: 0.9,
};

function createService(
  impl: RetrievalService['search'] = async () => [CHUNK],
) {
  const search = vi.fn(impl);
  const service = new SearchService({ search } as unknown as RetrievalService);
  return { service, search };
}

describe('SearchService', () => {
  it('forwards a document filter to retrieval', async () => {
    const { service, search } = createService();

    await service.search('org-1', {
      q: 'retries',
      limit: 10,
      documentId: '00000000-0000-4000-8000-000000000001',
    });

    expect(search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      text: 'retries',
      limit: 10,
      documentId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('returns results derived from the retrieved chunks', async () => {
    const { service, search } = createService();

    const result = await service.search('org-1', { q: 'retries', limit: 10 });

    expect(search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      text: 'retries',
      limit: 10,
    });
    expect(result).toEqual({
      results: [
        {
          documentId: 'doc-1',
          documentTitle: 'Architecture Notes',
          pageNumber: 2,
          chunkIndex: 4,
          excerpt: 'Retries are bounded by maxAttempts.',
          score: 0.9,
        },
      ],
    });
  });

  it('returns an empty result set when nothing matches', async () => {
    const { service } = createService(async () => []);

    await expect(
      service.search('org-1', { q: 'retries', limit: 10 }),
    ).resolves.toEqual({ results: [] });
  });

  it('maps an unavailable embedding to 503', async () => {
    const { service } = createService(async () => {
      throw new EmbeddingUnavailableError('down');
    });

    await expect(
      service.search('org-1', { q: 'retries', limit: 10 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['rejected', new EmbeddingRejectedError('bad')],
    ['unusable response', new EmbeddingResponseError('bad')],
  ])('maps an %s embedding to 502', async (_label, thrown) => {
    const { service } = createService(async () => {
      throw thrown;
    });

    await expect(
      service.search('org-1', { q: 'retries', limit: 10 }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps a query error to 400', async () => {
    const { service } = createService(async () => {
      throw new RetrievalQueryError('blank');
    });

    await expect(
      service.search('org-1', { q: 'retries', limit: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates an unexpected failure unchanged', async () => {
    const failure = new Error('database exploded');
    const { service } = createService(async () => {
      throw failure;
    });

    await expect(
      service.search('org-1', { q: 'retries', limit: 10 }),
    ).rejects.toBe(failure);
  });
});
