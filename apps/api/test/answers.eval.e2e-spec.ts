import { writeFileSync } from 'node:fs';
import { RERANKER } from '../src/answers/reranker.port.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';
import { QUERY_REWRITER } from '../src/answers/query-rewriter.port.js';
import { createHash, randomUUID } from 'node:crypto';
import { judgeGrounding } from './answers-eval/grounding-judge.js';
import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AnswerResponse } from '@knowledgehub/shared-types';
import { AppModule } from '../src/app.module.js';
import {
  ANSWER_PROVIDER,
  AnswerRejectedError,
  AnswerUnavailableError,
  type AnswerProvider,
} from '../src/answers/answer-provider.port.js';
import { AnswersService } from '../src/answers/answers.service.js';
import {
  EMBEDDING_PROVIDER,
  EmbeddingRejectedError,
  EmbeddingResponseError,
  type EmbeddingProvider,
} from '../src/embeddings/embedding-provider.port.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { allCorpusPages } from './answers-eval/corpus.js';
import {
  computeMetrics,
  type EvalQuestion,
  type QuestionOutcome,
} from './answers-eval/metrics.js';
import { EVAL_QUESTIONS } from './answers-eval/questions.js';
import { formatSweepReport, type SweepRun } from './answers-eval/report.js';

const TEST_PLACEHOLDER_KEY = 'test-only-openai-api-key';
const EVAL_USER_ID = randomUUID();
const SIMILARITY_THRESHOLDS = [0.2, 0.35, 0.5];

interface LoggedAnswer {
  status: string;
  organizationId: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

function isLoggedAnswer(value: unknown): value is LoggedAnswer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'organizationId' in value &&
    'status' in value &&
    'durationMs' in value
  );
}

function redact(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? redact(`${error.name}: ${error.message}`)
    : redact(String(error));
}

function isFatal(error: unknown): boolean {
  if (error instanceof ServiceUnavailableException) {
    return true;
  }

  if (
    error instanceof EmbeddingRejectedError ||
    error instanceof EmbeddingResponseError
  ) {
    return true;
  }

  const cause = error instanceof Error ? error.cause : undefined;

  return (
    cause instanceof EmbeddingRejectedError ||
    cause instanceof EmbeddingResponseError ||
    cause instanceof AnswerRejectedError ||
    cause instanceof AnswerUnavailableError
  );
}

function violationOf(error: unknown): string {
  if (error instanceof BadGatewayException) {
    const cause = error.cause;

    return cause instanceof Error
      ? `${error.name} / ${cause.name}`
      : error.name;
  }

  return error instanceof Error ? error.name : 'UnknownError';
}

function assertEnvironment(): void {
  const problems: string[] = [];

  if (process.env.ANSWERS_EVAL !== 'true') {
    problems.push('ANSWERS_EVAL must be "true" to run the evaluation');
  }

  if (process.env.ANSWERS_ENABLED !== 'true') {
    problems.push('ANSWERS_ENABLED must be "true" for the evaluation');
  }

  if (!process.env.OPENAI_API_KEY) {
    problems.push('OPENAI_API_KEY is required');
  } else if (process.env.OPENAI_API_KEY === TEST_PLACEHOLDER_KEY) {
    problems.push(
      'OPENAI_API_KEY is the test placeholder; export a real key to run the evaluation',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Answers evaluation cannot start:\n- ${problems.join('\n- ')}`,
    );
  }
}

function assertResolvedConfig(config: ConfigService): void {
  const problems: string[] = [];

  for (const key of [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'ANSWER_MODEL',
    'EMBEDDING_MODEL',
  ]) {
    if (!config.get<string>(key)) {
      problems.push(`${key} resolved empty`);
    }
  }

  if (config.get<string>('ANSWERS_ENABLED') !== 'true') {
    problems.push('ANSWERS_ENABLED did not resolve to "true"');
  }

  if (problems.length > 0) {
    throw new Error(
      `Answers evaluation configuration is incomplete:\n- ${problems.join('\n- ')}`,
    );
  }
}

async function preflight(app: INestApplication): Promise<void> {
  const embeddings = app.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
  const provider = app.get<AnswerProvider>(ANSWER_PROVIDER);
  let failure: string | null = null;

  try {
    const [vector] = await embeddings.embed(['answers evaluation preflight']);

    if (
      !vector ||
      vector.length !== EMBEDDING_VECTOR_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('the embedding provider returned an unexpected vector');
    }

    await provider.generate(
      {
        system: 'Return status insufficient_evidence with null claims.',
        user: 'Question: preflight',
      },
      { maxOutputTokens: 32 },
    );
  } catch (error) {
    failure = describeError(error);
  }

  if (failure !== null) {
    throw new Error(`Answers evaluation preflight failed: ${failure}`);
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function seedCorpus(
  app: INestApplication,
  prisma: PrismaService,
): Promise<string> {
  const embeddings = app.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
  const pages = allCorpusPages();
  const vectors = await embeddings.embed(pages.map((page) => page.text));

  if (vectors.length !== pages.length) {
    throw new Error(
      `The embedding provider returned ${vectors.length} vectors for ${pages.length} pages`,
    );
  }

  const organization = await prisma.organization.create({
    data: { name: `answers-eval-${randomUUID()}` },
  });
  const documents = new Map<string, string>();

  for (const [index, page] of pages.entries()) {
    const vector = vectors[index];

    if (
      !vector ||
      vector.length !== EMBEDDING_VECTOR_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `The embedding provider returned an unexpected vector for "${page.documentTitle}" page ${page.pageNumber}`,
      );
    }

    let documentId = documents.get(page.documentTitle);

    if (!documentId) {
      const document = await prisma.document.create({
        data: {
          organizationId: organization.id,
          title: page.documentTitle,
          status: 'READY',
          generation: 1,
          contentType: 'text/plain',
          sizeBytes: page.text.length,
        },
      });

      documentId = document.id;
      documents.set(page.documentTitle, documentId);
    }

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${documentId}::uuid,
        ${organization.id}::uuid,
        1,
        ${page.pageNumber},
        ${page.pageNumber - 1},
        ${page.text},
        ${page.text.length},
        ${vectorLiteral(vector)}::vector,
        now(),
        now()
      )
    `;
  }

  return organization.id;
}

describe('answers evaluation (real providers)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let answers: AnswersService;
  let config: ConfigService;
  let organizationId: string | null = null;
  let logged: LoggedAnswer[] = [];
  let providerDraft: unknown;
  let restoreLogs: Array<() => void> = [];

  const capture = (message: unknown): void => {
    if (isLoggedAnswer(message)) {
      logged.push(message);
    }
  };

  beforeAll(async () => {
    assertEnvironment();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SUMMARIZER)
      .useValue({
        summarize: async () => ({ summary: 'test summary', keyTopics: [] }),
      })
      .overrideProvider(RERANKER)
      .useValue({ rerank: async () => [] })
      .overrideProvider(QUERY_REWRITER)
      .useValue({ rewrite: async (question: string) => question })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    answers = app.get(AnswersService);
    config = app.get(ConfigService);

    assertResolvedConfig(config);
    await preflight(app);
    await prisma.user.create({
      data: {
        id: EVAL_USER_ID,
        email: `eval-${EVAL_USER_ID}@example.test`,
        passwordHash: 'unused-evaluation-account',
        firstName: 'Evaluation',
        lastName: 'Runner',
      },
    });
    organizationId = await seedCorpus(app, prisma);
    await prisma.membership.create({
      data: { organizationId, userId: EVAL_USER_ID, role: 'OWNER' },
    });
    const judgeOptions = {
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
      baseUrl: config.getOrThrow<string>('OPENAI_BASE_URL'),
      model:
        process.env.EVAL_JUDGE_MODEL ??
        config.getOrThrow<string>('ANSWER_MODEL'),
    };
    const calibration = {
      evidence: [
        {
          marker: 1,
          documentTitle: 'Calibration',
          pageNumber: 1,
          text: 'Payment terms are net-30.',
        },
      ],
      ...judgeOptions,
    };
    expect(
      (
        await judgeGrounding({
          ...calibration,
          answer: 'Payment terms are net-30 [1].',
        })
      ).supported,
    ).toBe(true);
    expect(
      (
        await judgeGrounding({
          ...calibration,
          answer: 'Payment terms are net-90 [1].',
        })
      ).supported,
    ).toBe(false);

    const provider = app.get<AnswerProvider>(ANSWER_PROVIDER);
    const generate = provider.generate.bind(provider);
    const draftCapture = vi
      .spyOn(provider, 'generate')
      .mockImplementation(async (...args) => {
        const result = await generate(...args);
        providerDraft = result.draft;
        return result;
      });
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    restoreLogs = [
      () => log.mockRestore(),
      () => warn.mockRestore(),
      () => draftCapture.mockRestore(),
    ];
  }, 180_000);

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    for (const restore of restoreLogs) {
      restore();
    }

    if (prisma) await prisma.user.deleteMany({ where: { id: EVAL_USER_ID } });
    await app?.close();
  }, 60_000);

  const ask = async (item: EvalQuestion): Promise<QuestionOutcome> => {
    logged = [];
    providerDraft = undefined;
    const startedAt = performance.now();
    let response: AnswerResponse | null = null;
    let thrown: unknown = null;

    try {
      let conversationId: string | undefined;
      if (item.history?.length) {
        const conversation = await prisma.conversation.create({
          data: {
            organizationId: organizationId as string,
            createdById: EVAL_USER_ID,
          },
        });
        conversationId = conversation.id;
        await prisma.answer.createMany({
          data: item.history.map((turn, index) => ({
            organizationId: organizationId as string,
            conversationId,
            askedById: EVAL_USER_ID,
            question: turn.question,
            answer: turn.answer,
            status: 'answered',
            citations: [],
            createdAt: new Date(Date.now() + index),
          })),
        });
      }
      response = await answers.answer(
        organizationId as string,
        EVAL_USER_ID,
        item.question,
        conversationId,
      );
    } catch (error) {
      thrown = error;
    }

    const wallMs = Math.round(performance.now() - startedAt);
    const event = logged.find(
      (entry) => entry.organizationId === organizationId,
    );
    const base = {
      id: item.id,
      kind: item.kind,
      expected: item.expected,
      supporting: item.supporting,
      latencyMs: event ? Math.round(event.durationMs) : wallMs,
      inputTokens: event?.inputTokens ?? null,
      outputTokens: event?.outputTokens ?? null,
    };

    if (thrown !== null) {
      if (isFatal(thrown)) {
        throw new Error(
          `Answers evaluation aborted on "${item.id}": ${describeError(thrown)}`,
        );
      }

      return {
        ...base,
        status: 'error',
        citations: [],
        answer: null,
        violation: `${violationOf(thrown)}: ${JSON.stringify(providerDraft) ?? 'no draft'}`,
      };
    }

    if (response === null) {
      throw new Error(
        `Answers evaluation received no response for "${item.id}"`,
      );
    }

    const groundingVerdict =
      response.status === 'insufficient_evidence'
        ? null
        : await judgeGrounding({
            answer: response.answer,
            evidence: response.citations.map((citation) => {
              const page = allCorpusPages().find(
                (page) =>
                  page.documentTitle === citation.documentTitle &&
                  page.pageNumber === citation.pageNumber,
              );
              if (!page)
                throw new Error(
                  `Unknown evaluation source: ${citation.documentTitle}`,
                );
              return {
                marker: citation.marker,
                documentTitle: page.documentTitle,
                pageNumber: page.pageNumber,
                text: page.text,
              };
            }),
            apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
            baseUrl: config.getOrThrow<string>('OPENAI_BASE_URL'),
            model:
              process.env.EVAL_JUDGE_MODEL ??
              config.getOrThrow<string>('ANSWER_MODEL'),
          });
    return {
      ...base,
      groundingVerdict,
      status: response.status,
      citations: response.citations.map((citation) => ({
        documentTitle: citation.documentTitle,
        pageNumber: citation.pageNumber,
      })),
      answer:
        response.status !== 'insufficient_evidence' ? response.answer : null,
      violation: null,
    };
  };

  it('reports metrics across the similarity-floor sweep and enforces the hard gates', async () => {
    const runs: SweepRun[] = [];

    for (const threshold of SIMILARITY_THRESHOLDS) {
      config.set('ANSWER_MIN_SIMILARITY', threshold);
      const outcomes: QuestionOutcome[] = [];

      for (const item of EVAL_QUESTIONS) {
        outcomes.push(await ask(item));
      }

      runs.push({
        threshold,
        outcomes,
        metrics: computeMetrics(outcomes),
      });
    }

    writeFileSync(
      'eval/answers-results.json',
      JSON.stringify(
        Object.fromEntries(
          runs.map(({ threshold, metrics }) => [threshold, metrics]),
        ),
        null,
        2,
      ) + '\n',
    );

    writeFileSync(
      'eval/answer-outcomes-results.json',
      JSON.stringify(runs, null, 2) + '\n',
    );
    writeFileSync(
      'eval/metadata-results.json',
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          model: config.get<string>('ANSWER_MODEL'),
          embeddingModel: config.get<string>('EMBEDDING_MODEL'),
          judgeModel:
            process.env.EVAL_JUDGE_MODEL ?? config.get<string>('ANSWER_MODEL'),
          corpusHash: createHash('sha256')
            .update(JSON.stringify(allCorpusPages()))
            .digest('hex'),
          questionIds: EVAL_QUESTIONS.map((item) => item.id),
          thresholds: SIMILARITY_THRESHOLDS,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      formatSweepReport(runs, {
        model: config.get<string>('ANSWER_MODEL') ?? 'unknown',
        embeddingModel: config.get<string>('EMBEDDING_MODEL') ?? 'unknown',
        questionCount: EVAL_QUESTIONS.length,
      }),
    );

    for (const run of runs) {
      expect(run.metrics.structuralIntegrity).toBe(1);
      expect(run.metrics.refusalAccuracy).toBe(1);
    }
  }, 600_000);
});
