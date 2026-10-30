import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
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
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AggregationService } from '../aggregation/aggregation.service.js';
import type { FactsConfig } from '../facts/facts.config.js';
import type {
  AnswerStreamEvent,
  ContractTotalsResponse,
} from '@knowledgehub/shared-types';
import type { AnswerConfig } from './answer.config.js';
import type { CatalogDocumentRow } from './answer-catalog.js';
import {
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
  type AnswerGenerationChunk,
  type AnswerProvider,
  type AnswerUsage,
} from './answer-provider.port.js';
import { AnswersService } from './answers.service.js';
import type { UsageService } from '../rate-limit/usage.service.js';

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
  lexicalMatch: false,
};

const CATALOG_DOCUMENT: CatalogDocumentRow = {
  id: 'doc-catalog',
  title: 'Envios locales',
  originalFileName: 'envios.xlsx',
  generation: 1,
  extractions: [{ documentGeneration: 1, pageCount: 2 }],
  chunks: [
    {
      id: 'chunk-catalog',
      documentGeneration: 1,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'Guía Fecha Cliente Monto ME-000022 $40.00',
    },
  ],
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
  return {
    retrieval: { search, neighbours: vi.fn().mockResolvedValue([]) } as unknown as RetrievalService,
    search,
  };
}

function createProvider(
  impl: AnswerProvider['generate'] = async () =>
    generation({
      status: 'answered',
      claims: [{ text: 'Retries are bounded.', source: 1 }],
    }),
  streamImpl?: AnswerProvider['stream'],
) {
  const generate = vi.fn(impl);
  const stream = streamImpl ? vi.fn(streamImpl) : undefined;
  const provider = {
    generate,
    ...(stream ? { stream } : {}),
  } as AnswerProvider;

  return { provider, generate, stream };
}

function answerStream(
  deltas: string[],
): AsyncGenerator<AnswerGenerationChunk> {
  async function* generate(): AsyncGenerator<AnswerGenerationChunk> {
    for (const text of deltas) {
      yield { type: 'delta', text };
    }

    yield {
      type: 'done',
      usage: { inputTokens: 12, outputTokens: 3 },
    };
  }

  return generate();
}

async function collectStream(
  events: AsyncGenerator<AnswerStreamEvent>,
): Promise<AnswerStreamEvent[]> {
  const collected: AnswerStreamEvent[] = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

function createPrisma() {
  return {
    answer: {
      create: vi.fn(async (_args?: unknown) => ({})),
      findMany: vi.fn(async (_args?: unknown) => [] as unknown[]),
      findFirst: vi.fn(async (_args?: unknown) => null as unknown),
      deleteMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    answerFeedback: {
      upsert: vi.fn(async (_args?: unknown) => ({
        value: 'UP',
        comment: null,
      })),
      deleteMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    conversation: {
      findFirst: vi.fn(
        async (): Promise<{ id: string } | null> => ({ id: 'conversation-1' }),
      ),
      updateMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    document: {
      findFirst: vi.fn(
        async (): Promise<{ status: string } | null> => ({ status: 'READY' }),
      ),
      findMany: vi.fn(async (_args?: unknown) => [] as unknown[]),
      count: vi.fn(async (_args?: unknown) => 0),
    },
  };
}

function createService(options: {
  chunks?: RetrievedChunk[];
  catalog?: CatalogDocumentRow[];
  catalogTotal?: number;
  retrievalImpl?: RetrievalService['search'];
  providerImpl?: AnswerProvider['generate'];
  streamImpl?: AnswerProvider['stream'];
  configOverrides?: Partial<Record<string, unknown>>;
  usageImpl?: () => Promise<void>;
  factsEnabled?: boolean;
  aggregateImpl?: AggregationService['contractTotals'];
  rewriteImpl?: (question: string) => Promise<string>;
} = {}) {
  const { retrieval, search } = createRetrieval(
    options.retrievalImpl ?? (async () => options.chunks ?? [CHUNK]),
  );
  const { provider, generate, stream } = createProvider(
    options.providerImpl,
    options.streamImpl,
  );
  const config = createConfig(options.configOverrides);
  const prisma = createPrisma();
  prisma.document.findMany.mockResolvedValue(options.catalog ?? []);
  prisma.document.count.mockResolvedValue(
    options.catalogTotal ?? options.catalog?.length ?? 0,
  );
  const usage = {
    recordAnswer: vi.fn(options.usageImpl ?? (async () => undefined)),
  };
  const aggregation = {
    contractTotals: vi.fn(
      options.aggregateImpl ??
        (async () => {
          throw new Error('Unexpected aggregate call');
        }),
    ),
  } as unknown as AggregationService;
  const factsConfig = {
    enabled: options.factsEnabled ?? false,
  } as unknown as FactsConfig;
  const rewrite = vi.fn(options.rewriteImpl ?? (async (question: string) => question));
  const service = new AnswersService(
    provider,
    retrieval,
    config,
    prisma as unknown as PrismaService,
    usage as unknown as UsageService,
    aggregation,
    factsConfig,
    { rewrite },
  );

  return {
    service,
    rewrite,
    search,
    generate,
    stream,
    config,
    prisma,
    usage,
    aggregation,
  };
}

const AGGREGATE_RESPONSE: ContractTotalsResponse = {
  status: 'complete',
  coverage: { documents: 1, extracted: 1, failed: 0, pending: 0 },
  collapsedDuplicates: 0,
  totalFacts: 110,
  totals: [
    { currency: 'USD', scale: 2, totalMinor: '10280749', contractCount: 110 },
  ],
  sources: [
    {
      documentId: 'doc-a',
      documentTitle: 'Contracts',
      currency: 'USD',
      scale: 2,
      subtotalMinor: '10280749',
      contractCount: 110,
      pageNumber: 1,
      chunkIndex: 0,
      excerpt: '1143 Plan Personalizado $500.00 28/07/2026',
    },
  ],
  breakdown: [],
};

describe('AnswersService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers a total question from facts without calling the provider', async () => {
    const { service, search, generate, usage } = createService({
      factsEnabled: true,
      aggregateImpl: async () => AGGREGATE_RESPONSE,
    });

    const response = await service.answer(
      'org-1',
      USER_ID,
      'dame la suma de montos totales',
    );

    expect(response.status).toBe('answered');
    if (response.status === 'answered') {
      expect(response.answer).toMatch(/102[.,]807[.,]49/);
      expect(response.answer).toContain('110');
      expect(response.citations).toHaveLength(1);
      expect(response.citations[0]?.documentId).toBe('doc-a');
    }

    expect(search).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(usage.recordAnswer).not.toHaveBeenCalled();
  });

  it('falls back to retrieval when the aggregate has no facts', async () => {
    const { service, search, generate } = createService({
      factsEnabled: true,
      aggregateImpl: async () => ({
        ...AGGREGATE_RESPONSE,
        totalFacts: 0,
        totals: [],
        sources: [],
      }),
    });

    await service.answer('org-1', USER_ID, 'dame la suma de montos totales');

    expect(search).toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
  });

  it('does not aggregate a question about one contract', async () => {
    const { service, search, aggregation } = createService({
      factsEnabled: true,
      aggregateImpl: async () => AGGREGATE_RESPONSE,
    });

    await service.answer('org-1', USER_ID, 'What is the total of contract 1143?');

    expect(aggregation.contractTotals).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalled();
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
      limit: 24,
    });
  });

  it('scopes retrieval to the requested document when one is supplied', async () => {
    const { service, search, prisma } = createService();

    await service.answer('org-1', USER_ID, 'What is alpha?', undefined, 'doc-9');

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-9', organizationId: 'org-1' },
      select: { status: true },
    });
    expect(search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      text: 'What is alpha?',
      limit: 24,
      documentId: 'doc-9',
    });
  });

  it('diversifies unscoped results and keeps all matches for a scoped document', async () => {
    const chunks = Array.from({ length: 5 }, (_, index) => ({
      ...CHUNK,
      chunkId: `chunk-${index}`,
      chunkIndex: index,
      content: `passage-${index}`,
    }));
    const unscoped = createService({ chunks });
    await unscoped.service.answer('org-1', USER_ID, 'Question?');
    expect(unscoped.generate.mock.calls[0]![0].user).not.toContain('passage-4');

    const scoped = createService({ chunks });
    await scoped.service.answer('org-1', USER_ID, 'Question?', undefined, 'doc-9');
    expect(scoped.generate.mock.calls[0]![0].user).toContain('passage-4');
  });

  it('does not check a document when the question is unscoped', async () => {
    const { service, prisma } = createService();

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a question scoped to a document outside the organization with 404', async () => {
    const { service, search, prisma } = createService();
    prisma.document.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?', undefined, 'doc-9'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects a question scoped to a document that is not READY with 409', async () => {
    const { service, search, prisma } = createService();
    prisma.document.findFirst.mockResolvedValueOnce({ status: 'PROCESSING' });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?', undefined, 'doc-9'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(search).not.toHaveBeenCalled();
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

  it('streams validated claims as the provider produces them and then persists', async () => {
    const { service, prisma, generate, stream } = createService({
      streamImpl: () =>
        answerStream([
          '{"status":"answered","claims":[',
          '{"text":"Retries are bounded.","source":1}',
          ']}',
        ]),
    });

    await expect(
      collectStream(service.answerStream('org-1', USER_ID, 'What is alpha?')),
    ).resolves.toEqual([
      { type: 'status', status: 'answered' },
      { type: 'delta', text: 'Retries are bounded [1].' },
      {
        type: 'citations',
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
      },
    ]);

    expect(generate).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(prisma.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          question: 'What is alpha?',
          status: 'answered',
          answer: 'Retries are bounded [1].',
        }),
      }),
    );
  });

  it('streams a refusal without emitting prose', async () => {
    const { service, prisma } = createService({
      streamImpl: () =>
        answerStream([
          '{"status":"insufficient_evidence","claims":null}',
        ]),
    });

    await expect(
      collectStream(service.answerStream('org-1', USER_ID, 'What is alpha?')),
    ).resolves.toEqual([
      { type: 'status', status: 'insufficient_evidence' },
      { type: 'citations', citations: [] },
    ]);

    expect(prisma.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'insufficient_evidence',
          answer: null,
        }),
      }),
    );
  });

  it('rejects a streamed claim that cites an unknown source', async () => {
    const { service, prisma } = createService({
      streamImpl: () =>
        answerStream([
          '{"status":"answered","claims":[{"text":"Retries.","source":9}]}',
        ]),
    });

    await expect(
      collectStream(service.answerStream('org-1', USER_ID, 'What is alpha?')),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.answer.create).not.toHaveBeenCalled();
  });

  it('streams a validated answer when the provider cannot stream', async () => {
    const { service, stream } = createService({
      providerImpl: async () =>
        generation({
          status: 'answered',
          claims: [{ text: 'Retries are bounded.', source: 1 }],
        }),
    });

    await expect(
      collectStream(service.answerStream('org-1', USER_ID, 'What is alpha?')),
    ).resolves.toEqual([
      { type: 'status', status: 'answered' },
      { type: 'delta', text: 'Retries are bounded [1].' },
      {
        type: 'citations',
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
      },
    ]);

    expect(stream).toBeUndefined();
  });

  it('answers document-inventory questions from the catalog when no passage clears the floor', async () => {
    const { service, generate } = createService({
      chunks: [],
      catalog: [CATALOG_DOCUMENT],
      providerImpl: async () =>
        generation({
          status: 'answered',
          claims: [
            {
              text: 'The organization has one document about local shipments.',
              source: 1,
            },
          ],
        }),
    });

    await expect(service.answer('org-1', USER_ID, 'Which documents do I have?')).resolves.toEqual({
      status: 'answered',
      answer:
        'The organization has one document about local shipments [1].',
      citations: [
        {
          marker: 1,
          documentId: 'doc-catalog',
          documentTitle: 'Envios locales',
          pageNumber: 1,
          chunkIndex: 0,
          excerpt: 'Guía Fecha Cliente Monto ME-000022 $40.00',
        },
      ],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('numbers retrieved passages before catalog entries so content citations keep their markers', async () => {
    const { service, generate } = createService({
      catalog: [CATALOG_DOCUMENT],
      providerImpl: async () =>
        generation({
          status: 'answered',
          claims: [
            { text: 'Retries are bounded.', source: 1 },
            { text: 'A shipment document exists.', source: 2 },
          ],
        }),
    });

    const result = await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(result.status).toBe('answered');
    expect(result.citations.map((citation) => citation.marker)).toEqual([1, 2]);
    expect(result.citations[1]).toMatchObject({
      documentId: 'doc-catalog',
      documentTitle: 'Envios locales',
    });

    const prompt = generate.mock.calls[0]![0];
    expect(prompt.user.indexOf('<source id="1"')).toBeLessThan(
      prompt.user.indexOf('<document id="2"'),
    );
  });

  it('scopes the document catalog to the selected document', async () => {
    const { service, prisma } = createService({ catalog: [CATALOG_DOCUMENT] });

    await service.answer('org-1', USER_ID, 'What is alpha?', undefined, 'doc-9');

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', status: 'READY', id: 'doc-9' },
      }),
    );
    expect(prisma.document.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'READY', id: 'doc-9' },
    });
  });

  it('records usage and then answers when sources are available', async () => {
    const { service, usage } = createService();

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(usage.recordAnswer).toHaveBeenCalledWith('org-1');
  });

  it('does not record usage when retrieval yields no sources', async () => {
    const { service, usage } = createService({ chunks: [] });

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(usage.recordAnswer).not.toHaveBeenCalled();
  });

  it('loads prior turns and persists the follow-up under its conversation', async () => {
    const { service, prisma, generate } = createService();
    prisma.answer.findMany.mockResolvedValueOnce([
      { question: 'What is alpha?', answer: 'Alpha [1].' },
    ]);

    await service.answer(
      'org-1',
      USER_ID,
      'What about beta?',
      'conversation-1',
    );

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversation-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(prisma.answer.findMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        organizationId: 'org-1',
        status: 'answered',
        answer: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { question: true, answer: true },
      take: 20,
    });
    expect(prisma.answer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'conversation-1' }),
    });
    expect(generate).toHaveBeenCalled();
  });

  it('rewrites follow-ups only for retrieval', async () => {
    const { service, prisma, search, generate, rewrite } = createService({ rewriteImpl: async () => 'standalone query' });
    prisma.answer.findMany.mockResolvedValueOnce([{ question: 'First?', answer: 'Answer.' }]);
    await service.answer('org-1', USER_ID, 'And second?', 'conversation-1');
    expect(rewrite).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ text: 'standalone query' }));
    expect(generate.mock.calls[0]![0].user).toContain('Question:\nAnd second?');
  });

  it('skips rewriting without history', async () => {
    const { service, rewrite } = createService();
    await service.answer('org-1', USER_ID, 'First?');
    expect(rewrite).not.toHaveBeenCalled();
  });

  it.each([async () => { throw new Error('offline'); }, async () => '  '])('falls back when rewriting fails', async (rewriteImpl) => {
    const { service, prisma, search } = createService({ rewriteImpl });
    prisma.answer.findMany.mockResolvedValueOnce([{ question: 'First?', answer: 'Answer.' }]);
    await service.answer('org-1', USER_ID, 'And second?', 'conversation-1');
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ text: 'And second?' }));
  });

  it('titles the conversation from its first question', async () => {
    const { service, prisma } = createService();

    await service.answer(
      'org-1',
      USER_ID,
      '  What   about beta?  ',
      'conversation-1',
    );

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
        organizationId: 'org-1',
        title: null,
      },
      data: { title: 'What about beta?' },
    });
  });

  it('truncates a long question when titling the conversation', async () => {
    const { service, prisma } = createService();
    const question = 'a'.repeat(200);

    await service.answer('org-1', USER_ID, question, 'conversation-1');

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
        organizationId: 'org-1',
        title: null,
      },
      data: { title: `${'a'.repeat(79)}…` },
    });
  });

  it('rejects a follow-up whose conversation is not in the organization', async () => {
    const { service, prisma } = createService();
    prisma.conversation.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.answer(
        'org-1',
        USER_ID,
        'What about beta?',
        'conversation-other',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters history by conversation when requested', async () => {
    const { service, prisma } = createService();

    await service.list('org-1', USER_ID, { limit: 25, askedBy: 'organization', conversationId: 'conversation-1' });

    expect(prisma.answer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', conversationId: 'conversation-1' },
      }),
    );
  });

  it('rejects with the quota error before generating when the tenant is over quota', async () => {
    const quotaError = new HttpException(
      { statusCode: 429, message: 'The organization has reached its daily answer limit' },
      429,
    );
    const { service, generate } = createService({
      usageImpl: async () => {
        throw quotaError;
      },
    });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
    ).rejects.toBe(quotaError);
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
          claims: [
            { text: 'Second.', source: 2 },
            { text: 'First.', source: 1 },
            { text: 'Second again.', source: 2 },
          ],
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
        generation({ status: 'insufficient_evidence', claims: null }),
    });

    await expect(service.answer('org-1', USER_ID, 'What is alpha?')).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
  });

  it.each([
    [
      'a claim citing an unknown source',
      { status: 'answered', claims: [{ text: 'Alpha.', source: 9 }] },
    ],
    ['an empty claim list', { status: 'answered', claims: [] }],
    [
      'a blank claim',
      { status: 'answered', claims: [{ text: '   ', source: 1 }] },
    ],
    [
      'a non-integer source',
      { status: 'answered', claims: [{ text: 'Alpha.', source: 1.5 }] },
    ],
    [
      'unexpected fields',
      { status: 'answered', claims: [{ text: 'Alpha.', source: 1 }], extra: 1 },
    ],
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
        generation({
          status: 'insufficient_evidence',
          claims: [{ text: 'I refuse.', source: 1 }],
        }),
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
          {
            status: 'answered',
            claims: [{ text: 'ANSWER_SECRET_MARKER.', source: 1 }],
          },
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
      catalogCount: 0,
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
      catalogCount: 0,
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

  it('persists an answered response scoped to the organization and asker', async () => {
    const { service, prisma } = createService();

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(prisma.answer.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        askedById: USER_ID,
        question: 'What is alpha?',
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
      },
    });
  });

  it('persists a refusal with a null answer and no citations', async () => {
    const { service, prisma } = createService({ chunks: [] });

    await service.answer('org-1', USER_ID, 'What is alpha?');

    expect(prisma.answer.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        askedById: USER_ID,
        question: 'What is alpha?',
        status: 'insufficient_evidence',
        answer: null,
        citations: [],
      },
    });
  });

  it('still returns the answer when persisting it fails', async () => {
    const { service, prisma } = createService();
    prisma.answer.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
    ).resolves.toEqual({
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
  });

  it('does not persist when the answer step fails', async () => {
    const { service, prisma } = createService({
      providerImpl: async () => {
        throw new AnswerUnavailableError('timeout');
      },
    });

    await expect(
      service.answer('org-1', USER_ID, 'What is alpha?'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.answer.create).not.toHaveBeenCalled();
  });

  it('lists history scoped to the organization and keyset-ordered', async () => {
    const row = {
      id: 'answer-1',
      question: 'What is alpha?',
      status: 'answered',
      answer: 'Alpha [1].',
      citations: [],
      conversationId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { service, prisma } = createService();
    prisma.answer.findMany.mockResolvedValueOnce([row]);

    const result = await service.list('org-1', USER_ID, { limit: 25, askedBy: 'organization' });

    expect(prisma.answer.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: {
        id: true,
        question: true,
        status: true,
        answer: true,
        citations: true,
        conversationId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 26,
    });
    expect(result).toEqual({
      answers: [
        {
          id: 'answer-1',
          question: 'What is alpha?',
          status: 'answered',
          conversationId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('rejects a malformed cursor without querying', async () => {
    const { service, prisma } = createService();

    await expect(
      service.list('org-1', USER_ID, { limit: 25, askedBy: 'organization', cursor: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.answer.findMany).not.toHaveBeenCalled();
  });

  it('returns the full answer detail including citations', async () => {
    const { service, prisma } = createService();
    prisma.answer.findFirst.mockResolvedValueOnce({
      id: 'answer-1',
      question: 'What is alpha?',
      status: 'answered',
      answer: 'Alpha [1].',
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
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getDetail('org-1', 'answer-1', USER_ID);

    expect(prisma.answer.findFirst).toHaveBeenCalledWith({
      where: { id: 'answer-1', organizationId: 'org-1' },
      select: expect.objectContaining({ id: true, citations: true }),
    });
    expect(result.answer.status).toBe('answered');
    expect(result.answer.citations).toHaveLength(1);
  });

  it('stores the caller feedback for an answer in the organization', async () => {
    const { service, prisma } = createService();
    prisma.answer.findFirst.mockResolvedValueOnce({ id: 'answer-1' });

    const result = await service.setFeedback('org-1', 'answer-1', USER_ID, {
      value: 'UP',
    });

    expect(prisma.answerFeedback.upsert).toHaveBeenCalledWith({
      where: { answerId_userId: { answerId: 'answer-1', userId: USER_ID } },
      create: {
        answerId: 'answer-1',
        userId: USER_ID,
        value: 'UP',
        comment: null,
      },
      update: { value: 'UP', comment: null },
      select: { value: true, comment: true },
    });
    expect(result.feedback).toEqual({ value: 'UP', comment: null });
  });

  it('clears the caller feedback', async () => {
    const { service, prisma } = createService();
    prisma.answer.findFirst.mockResolvedValueOnce({ id: 'answer-1' });

    await service.clearFeedback('org-1', 'answer-1', USER_ID);

    expect(prisma.answerFeedback.deleteMany).toHaveBeenCalledWith({
      where: { answerId: 'answer-1', userId: USER_ID },
    });
  });

  it('rejects feedback for an answer outside the organization', async () => {
    const { service, prisma } = createService();

    await expect(
      service.setFeedback('org-1', 'answer-other', USER_ID, { value: 'DOWN' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.answerFeedback.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 for a detail outside the organization', async () => {
    const { service, prisma } = createService();
    prisma.answer.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getDetail('org-1', 'answer-1', USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an answer scoped to its organization', async () => {
    const { service, prisma } = createService();

    await service.delete('org-1', 'answer-1');

    expect(prisma.answer.deleteMany).toHaveBeenCalledWith({
      where: { id: 'answer-1', organizationId: 'org-1' },
    });
  });

  it('returns 404 when deleting a missing answer', async () => {
    const { service, prisma } = createService();
    prisma.answer.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.delete('org-1', 'answer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
