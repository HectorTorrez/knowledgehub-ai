import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  type AnswerUsage,
} from './answer-provider.port.js';
import { AnswersService } from './answers.service.js';

const USER_ID = 'user-1';

const NO_USAGE: AnswerUsage = { inputTokens: null, outputTokens: null };

function generation(draft: unknown, usage: AnswerUsage = NO_USAGE) {
  return { draft, usage };
}

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
    model: 'gpt-4.1-mini',
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
  impl: AnswerProvider['generate'] = async () =>
    generation({ status: 'answered', answer: 'Retries are bounded [1].' }),
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
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails closed with 503 and touches nothing when answers are disabled', async () => {
    const { service, search, generate } = createService({
      configOverrides: { enabled: false },
    });

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(search).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('retrieves within the configured source budget and passes the trimmed question', async () => {
    const { service, search } = createService();

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      text: 'What is alpha?',
      limit: 8,
    });
  });

  it('returns a fixed refusal without calling the provider when retrieval is empty', async () => {
    const { service, generate } = createService({ chunks: [] });

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).resolves.toEqual({
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

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers from the assembled sources and derives citations on the server', async () => {
    const { service, generate } = createService();

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).resolves.toEqual({
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
      providerImpl: async () =>
        generation({
          status: 'answered',
          answer: 'Second [2] and first [1] and second again [2].',
        }),
    });

    const response = await service.answer('org-1', USER_ID, 'What is alpha?');

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
      providerImpl: async () =>
        generation({ status: 'insufficient_evidence', answer: null }),
    });

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).resolves.toEqual({
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
      providerImpl: async () => generation(draft),
    });

    const error = await service
      .answer('org-1', USER_ID, 'What is alpha?')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(String((error as Error).message)).not.toContain('Alpha');
  });

  it('maps a refusal carrying an answer to 502', async () => {
    const { service } = createService({
      providerImpl: async () =>
        generation({ status: 'insufficient_evidence', answer: 'I refuse.' }),
    });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps provider unavailability to 503', async () => {
    const { service } = createService({
      providerImpl: async () => {
        throw new AnswerUnavailableError('timeout');
      },
    });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
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
      .answer('org-1', USER_ID, 'What is alpha?')
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
      service.answer('org-1', USER_ID, 'What is alpha?'),
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
      service.answer('org-1', USER_ID, 'What is alpha?'),
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

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).rejects.toBe(
      failure,
    );
  });

  it('logs one structured line per answered request with usage and no content', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const { service } = createService({
      chunks: [{ ...CHUNK, content: 'PASSAGE_SECRET_MARKER' }],
      providerImpl: async () =>
        generation(
          { status: 'answered', answer: 'ANSWER_SECRET_MARKER [1].' },
          { inputTokens: 11, outputTokens: 22 },
        ),
    });

    await service.answer('org-1', USER_ID, 'QUESTION_SECRET_MARKER?');

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls[0]![0] as Record<string, unknown>;

    expect(event).toMatchObject({
      status: 'answered',
      organizationId: 'org-1',
      userId: USER_ID,
      model: 'gpt-4.1-mini',
      sourceCount: 1,
      citationCount: 1,
      inputTokens: 11,
      outputTokens: 22,
    });
    expect(event.promptChars).toBeGreaterThan(0);
    expect(event.durationMs).toEqual(expect.any(Number));

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('QUESTION_SECRET_MARKER');
    expect(serialized).not.toContain('PASSAGE_SECRET_MARKER');
    expect(serialized).not.toContain('ANSWER_SECRET_MARKER');
  });

  it('logs a refusal without a provider call', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const { service, generate } = createService({ chunks: [] });

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(generate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatchObject({
      status: 'insufficient_evidence',
      sourceCount: 0,
      citationCount: 0,
      promptChars: 0,
      inputTokens: null,
      outputTokens: null,
    });
  });

  it('warns with the mapped and underlying error class names only on failure', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const { service } = createService({
      providerImpl: async () => {
        throw new AnswerResponseError('SECRET_PROVIDER_DETAIL');
      },
    });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);

    const event = warn.mock.calls[0]![0] as Record<string, unknown>;
    expect(event).toMatchObject({
      status: 'error',
      errorName: 'AnswerResponseError',
    });
    expect(JSON.stringify(event)).not.toContain('SECRET_PROVIDER_DETAIL');
  });

  it('preserves the mapped exception cause for diagnosability', async () => {
    const cause = new AnswerRejectedError('nope', 'configuration');
    const { service } = createService({
      providerImpl: async () => {
        throw cause;
      },
    });

    const error = await service
      .answer('org-1', USER_ID, 'What is alpha?')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).cause).toBe(cause);
  });
});
