import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import type {
  RetrievedChunk,
  RetrievalService,
} from '../retrieval/retrieval.service.js';
import type { AnswerConfig } from './answer.config.js';
import {
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
  type AnswerProvider,
} from './answer-provider.port.js';
import { AnswersService } from './answers.service.js';

const CHUNK: RetrievedChunk = {
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Architecture Notes',
  pageNumber: 2,
  chunkIndex: 4,
  content: 'Processing retries are bounded by maxAttempts.',
  similarity: 0.9,
};

function createConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    maxSources: 8,
    contextMaxChars: 100_000,
    minSimilarity: 0.2,
    maxOutputTokens: 700,
    ...overrides,
  } as unknown as AnswerConfig;
}

function createRetrieval(
  impl: RetrievalService['search'] = async () => [CHUNK],
) {
  const search = vi.fn(impl);
  return { retrieval: { search } as unknown as RetrievalService, search };
}

function createProvider(
  impl: AnswerProvider['generate'] = async () => ({
    status: 'answered',
    answer: 'Retries are bounded [1].',
  }),
) {
  const generate = vi.fn(impl);
  return { provider: { generate } as AnswerProvider, generate };
}

function createService(options: {
  chunks?: RetrievedChunk[];
  retrievalImpl?: RetrievalService['search'];
  providerImpl?: AnswerProvider['generate'];
  configOverrides?: Partial<Record<string, unknown>>;
} = {}) {
  const { retrieval, search } = createRetrieval(
    options.retrievalImpl ?? (async () => options.chunks ?? [CHUNK]),
  );
  const { provider, generate } = createProvider(options.providerImpl);
  const config = createConfig(options.configOverrides);
  const service = new AnswersService(provider, retrieval, config);

  return { service, search, generate, config };
}

describe('AnswersService', () => {
  it('fails closed with 503 and touches nothing when answers are disabled', async () => {
    const { service, search, generate } = createService({
      configOverrides: { enabled: false },
    });

    await expect(service.answer('org-1', 'What is alpha?')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(search).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('retrieves within the configured source budget and passes the trimmed question', async () => {
    const { service, search } = createService();

    await service.answer('org-1', 'What is alpha?');

    expect(search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      text: 'What is alpha?',
      limit: 8,
    });
  });

  it('returns a fixed refusal without calling the provider when retrieval is empty', async () => {
    const { service, generate } = createService({ chunks: [] });

    await expect(service.answer('org-1', 'What is alpha?')).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns a refusal without calling the provider when every chunk is below the floor', async () => {
    const { service, generate } = createService({
      chunks: [{ ...CHUNK, similarity: 0.1 }],
    });

    await expect(service.answer('org-1', 'What is alpha?')).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers from the assembled sources and derives citations on the server', async () => {
    const { service, generate } = createService();

    await expect(service.answer('org-1', 'What is alpha?')).resolves.toEqual({
      status: 'answered',
      answer: 'Retries are bounded [1].',
      citations: [
        {
          marker: 1,
          documentId: 'doc-1',
          documentTitle: 'Architecture Notes',
          pageNumber: 2,
          chunkIndex: 4,
          excerpt: 'Processing retries are bounded by maxAttempts.',
        },
      ],
    });

    const [prompt, options] = generate.mock.calls[0]!;
    expect(prompt.user).toContain('<source id="1" title="Architecture Notes" page="2">');
    expect(prompt.user).toContain(CHUNK.content);
    expect(prompt.user).toContain('What is alpha?');
    expect(options).toEqual({ maxOutputTokens: 700 });
  });

  it('cites only the markers the model actually used, in ascending order', async () => {
    const chunks = [
      CHUNK,
      {
        ...CHUNK,
        chunkId: 'chunk-2',
        documentId: 'doc-2',
        title: 'Handbook',
        pageNumber: 7,
        chunkIndex: 0,
        content: 'Second passage.',
      },
    ];
    const { service } = createService({
      chunks,
      providerImpl: async () => ({
        status: 'answered',
        answer: 'Second [2] and first [1] and second again [2].',
      }),
    });

    const response = await service.answer('org-1', 'What is alpha?');

    expect(response.status).toBe('answered');
    expect(
      response.status === 'answered'
        ? response.citations.map((citation) => citation.marker)
        : [],
    ).toEqual([1, 2]);
    expect(
      response.status === 'answered'
        ? response.citations.map((citation) => citation.documentId)
        : [],
    ).toEqual(['doc-1', 'doc-2']);
  });

  it('returns the fixed refusal when the model declines', async () => {
    const { service } = createService({
      providerImpl: async () => ({
        status: 'insufficient_evidence',
        answer: null,
      }),
    });

    await expect(service.answer('org-1', 'What is alpha?')).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
  });

  it.each([
    ['an unknown marker', { status: 'answered', answer: 'Bad [9].' }],
    ['no markers', { status: 'answered', answer: 'No marker here.' }],
    ['a malformed marker', { status: 'answered', answer: 'Bad [1,2].' }],
    ['an empty answer', { status: 'answered', answer: '   ' }],
    ['unexpected fields', { status: 'answered', answer: 'Alpha [1].', extra: 1 }],
    ['a non-object payload', 'not an object'],
  ])('maps %s to 502 without returning the payload', async (_label, draft) => {
    const { service } = createService({
      providerImpl: async () => draft,
    });

    const error = await service
      .answer('org-1', 'What is alpha?')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(String((error as Error).message)).not.toContain('Alpha');
  });

  it('maps a refusal carrying an answer to 502', async () => {
    const { service } = createService({
      providerImpl: async () => ({
        status: 'insufficient_evidence',
        answer: 'I refuse.',
      }),
    });

    await expect(
      service.answer('org-1', 'What is alpha?'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps provider unavailability to 503', async () => {
    const { service } = createService({
      providerImpl: async () => {
        throw new AnswerUnavailableError('timeout');
      },
    });

    await expect(
      service.answer('org-1', 'What is alpha?'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['a rejected credential', new AnswerRejectedError('nope', 'configuration')],
    ['a rejected request', new AnswerRejectedError('nope', 'request')],
    ['an unusable response', new AnswerResponseError('nope')],
  ])('maps %s to 502 without leaking the provider message', async (_label, thrown) => {
    const { service } = createService({
      providerImpl: async () => {
        throw thrown;
      },
    });

    const error = await service
      .answer('org-1', 'What is alpha?')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(String((error as Error).message)).not.toContain('nope');
  });

  it('maps an unavailable query embedding to 503 before any completion', async () => {
    const { service, generate } = createService({
      retrievalImpl: async () => {
        throw new EmbeddingUnavailableError('down');
      },
    });

    await expect(
      service.answer('org-1', 'What is alpha?'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ['a rejected query embedding', new EmbeddingRejectedError('bad')],
    ['an unusable query embedding', new EmbeddingResponseError('bad')],
  ])('maps %s to 502 before any completion', async (_label, thrown) => {
    const { service, generate } = createService({
      retrievalImpl: async () => {
        throw thrown;
      },
    });

    await expect(
      service.answer('org-1', 'What is alpha?'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(generate).not.toHaveBeenCalled();
  });

  it('propagates an unexpected retrieval failure unchanged', async () => {
    const failure = new Error('database exploded');
    const { service } = createService({
      retrievalImpl: async () => {
        throw failure;
      },
    });

    await expect(service.answer('org-1', 'What is alpha?')).rejects.toBe(
      failure,
    );
  });
});
