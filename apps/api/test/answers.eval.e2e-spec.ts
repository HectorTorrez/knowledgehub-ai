import { randomUUID } from 'node:crypto';
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
import {
  formatSweepReport,
  type SweepRun,
} from './answers-eval/report.js';

const TEST_PLACEHOLDER_KEY = 'test-only-openai-api-key';
const EVAL_USER_ID = 'answers-evaluation';
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
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    answers = app.get(AnswersService);
    config = app.get(ConfigService);

    assertResolvedConfig(config);
    await preflight(app);
    organizationId = await seedCorpus(app, prisma);

    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    restoreLogs = [() => log.mockRestore(), () => warn.mockRestore()];
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

    await app?.close();
  }, 60_000);

  const ask = async (item: EvalQuestion): Promise<QuestionOutcome> => {
    logged = [];
    const startedAt = performance.now();
    let response: AnswerResponse | null = null;
    let thrown: unknown = null;

    try {
      response = await answers.answer(
        organizationId as string,
        EVAL_USER_ID,
        item.question,
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
        violation: violationOf(thrown),
      };
    }

    if (response === null) {
      throw new Error(
        `Answers evaluation received no response for "${item.id}"`,
      );
    }

    return {
      ...base,
      status: response.status,
      citations: response.citations.map((citation) => ({
        documentTitle: citation.documentTitle,
        pageNumber: citation.pageNumber,
      })),
      answer: response.status === 'answered' ? response.answer : null,
      violation: null,
    };
  };

  it(
    'reports metrics across the similarity-floor sweep and enforces the hard gates',
    async () => {
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
    },
    600_000,
  );
});
