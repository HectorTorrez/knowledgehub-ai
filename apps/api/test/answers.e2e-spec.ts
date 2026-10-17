import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  AnswerRejectedError,
  AnswerUnavailableError,
  ANSWER_PROVIDER,
} from '../src/answers/answer-provider.port.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import {
  EmbeddingRejectedError,
  EmbeddingUnavailableError,
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../src/embeddings/embedding-provider.port.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeAnswerProvider } from './support/fake-answer-provider.js';

const PASSWORD = 'correct horse battery staple';

function basis(index: number): number[] {
  return Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, position) =>
    position === index ? 1 : 0,
  );
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function validBody() {
  return {
    email: `answer-${randomUUID()}@example.test`,
    password: PASSWORD,
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
}

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] ?? []) as unknown as string[];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return cookie.slice(name.length + 1).split(';')[0];
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function draft(value: unknown) {
  return {
    draft: value,
    usage: { inputTokens: null, outputTokens: null },
  };
}

interface SeedChunk {
  documentId: string;
  organizationId: string;
  documentGeneration: number;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

describe('answers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let answerProvider: FakeAnswerProvider;
  let embedImpl: EmbeddingProvider['embed'];
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();

  const embeddings: EmbeddingProvider = {
    embed: (texts) => embedImpl(texts),
  };

  const registerUser = async (): Promise<{
    userId: string;
    token: string;
  }> => {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return {
      userId: response.body.user.id as string,
      token: cookieValue(setCookies(response), ACCESS_TOKEN_COOKIE),
    };
  };

  const createOrganization = async (token: string, name: string) => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set(bearer(token))
      .send({ name })
      .expect(201);
    const organizationId = response.body.organization.id as string;
    trackedOrganizationIds.add(organizationId);
    return organizationId;
  };

  const seedDocument = async (
    organizationId: string,
    options: {
      status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
      generation?: number;
      title?: string;
    } = {},
  ): Promise<string> => {
    const document = await prisma.document.create({
      data: {
        organizationId,
        title: options.title ?? 'Architecture Notes',
        status: options.status ?? 'READY',
        generation: options.generation ?? 1,
        storageKey: `organizations/${organizationId}/documents/${randomUUID()}/verified/${randomUUID()}`,
        contentType: 'text/plain',
        sizeBytes: 10,
      },
    });
    return document.id;
  };

  const seedChunk = async (chunk: SeedChunk): Promise<void> => {
    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${chunk.documentId}::uuid,
        ${chunk.organizationId}::uuid,
        ${chunk.documentGeneration},
        ${chunk.pageNumber},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${chunk.content.length},
        ${vectorLiteral(chunk.embedding)}::vector,
        now(),
        now()
      )
    `;
  };

  const seedReadyChunk = async (
    organizationId: string,
    content: string,
    options: {
      generation?: number;
      pageNumber?: number;
      chunkIndex?: number;
      title?: string;
      embedding?: number[];
      status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
    } = {},
  ): Promise<string> => {
    const documentId = await seedDocument(organizationId, {
      status: options.status ?? 'READY',
      generation: options.generation ?? 1,
      title: options.title,
    });

    await seedChunk({
      documentId,
      organizationId,
      documentGeneration: options.generation ?? 1,
      pageNumber: options.pageNumber ?? 2,
      chunkIndex: options.chunkIndex ?? 4,
      content,
      embedding: options.embedding ?? basis(0),
    });

    return documentId;
  };

  const ask = (token: string, organizationId: string, body: object) =>
    request(app.getHttpServer())
      .post(`/organizations/${organizationId}/answers`)
      .set(bearer(token))
      .send(body);

  beforeAll(async () => {
    embedImpl = async () => [basis(0)];
    answerProvider = new FakeAnswerProvider();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(embeddings)
      .overrideProvider(ANSWER_PROVIDER)
      .useValue(answerProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    embedImpl = async () => [basis(0)];
    answerProvider.calls.length = 0;
    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'Default [1].' });
  });

  afterEach(async () => {
    if (trackedOrganizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...trackedOrganizationIds] } },
      });
      trackedOrganizationIds.clear();
    }

    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${randomUUID()}/answers`)
      .send({ question: 'What is alpha?' })
      .expect(401);
  });

  it('rejects an authenticated non-member with 403', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const organizationId = await createOrganization(owner.token, 'Guard Org');

    await ask(outsider.token, organizationId, {
      question: 'What is alpha?',
    }).expect(403);
  });

  it('rejects an invalid body with 400', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Invalid Org');

    const cases: object[] = [
      {},
      { question: '' },
      { question: '   ' },
      { question: 'a'.repeat(2001) },
      { question: 123 },
      { question: 'What is alpha?', organizationId: randomUUID() },
      { question: 'What is alpha?', documentIds: [randomUUID()] },
      { question: 'What is alpha?', limit: 5 },
    ];

    for (const body of cases) {
      await ask(token, organizationId, body).expect(400);
    }

    expect(answerProvider.calls).toHaveLength(0);
  });

  it('answers from the organization\u2019s READY passages with server-derived citations', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Answer Org');
    const documentId = await seedReadyChunk(
      organizationId,
      'Processing retries are bounded by maxAttempts.',
      { title: 'Architecture Notes', pageNumber: 2, chunkIndex: 4 },
    );

    answerProvider.generateImpl = async () =>
      draft({
        status: 'answered',
        answer: 'Retries are bounded by maxAttempts [1].',
      });

    const response = await ask(token, organizationId, {
      question: 'How are retries bounded?',
    }).expect(200);

    expect(response.body).toEqual({
      status: 'answered',
      answer: 'Retries are bounded by maxAttempts [1].',
      citations: [
        {
          marker: 1,
          documentId,
          documentTitle: 'Architecture Notes',
          pageNumber: 2,
          chunkIndex: 4,
          excerpt: 'Processing retries are bounded by maxAttempts.',
        },
      ],
    });

    expect(answerProvider.calls).toHaveLength(1);
    const { prompt, options } = answerProvider.calls[0]!;
    expect(prompt.user).toContain('Processing retries are bounded by maxAttempts.');
    expect(prompt.user).toContain('How are retries bounded?');
    expect(options.maxOutputTokens).toBe(700);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('generation');
    expect(serialized).not.toContain('embedding');
    expect(serialized).not.toContain('organizationId');
  });

  it('returns insufficient_evidence without calling the provider when the corpus is empty', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Empty Org');

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(200);

    expect(response.body).toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
    expect(answerProvider.calls).toHaveLength(0);
  });

  it('returns insufficient_evidence without calling the provider when nothing clears the similarity floor', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Weak Org');
    await seedReadyChunk(organizationId, 'unrelated passage', {
      embedding: basis(1),
    });

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(200);

    expect(response.body).toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
    expect(answerProvider.calls).toHaveLength(0);
  });

  it('returns the fixed refusal when the model declines', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Decline Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () =>
      draft({ status: 'insufficient_evidence', answer: null });

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(200);

    expect(response.body).toEqual({
      status: 'insufficient_evidence',
      answer: null,
      citations: [],
    });
  });

  it('maps provider unavailability to 503 without a partial answer', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Unavailable Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () => {
      throw new AnswerUnavailableError('timeout');
    };

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(503);

    expect(response.body).not.toHaveProperty('answer');
    expect(JSON.stringify(response.body)).not.toContain('some passage');
  });

  it('maps a rejected credential to 502 without leaking provider details', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Rejected Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () => {
      throw new AnswerRejectedError(
        'invalid key sk-secret-value',
        'configuration',
      );
    };

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('sk-secret-value');
    expect(serialized).not.toContain('invalid key');
    expect(response.body).not.toHaveProperty('answer');
  });

  it('maps an invalid citation to 502 and discards the answer', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Citation Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'Ungrounded claim [9].' });

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);

    expect(JSON.stringify(response.body)).not.toContain('Ungrounded claim');
  });

  it.each([
    ['a comma-separated group', 'Malformed [1,2].'],
    ['a range', 'Malformed [1-3].'],
    ['an unclosed marker', 'Malformed [1.'],
  ])(
    'maps %s to 502 and discards the answer',
    async (_label, answer) => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Malformed Org');
      await seedReadyChunk(organizationId, 'some passage');

      answerProvider.generateImpl = async () =>
        draft({ status: 'answered', answer });

      const response = await ask(token, organizationId, {
        question: 'What is alpha?',
      }).expect(502);

      expect(JSON.stringify(response.body)).not.toContain('Malformed');
    },
  );

  it('maps an answered response with zero citations to 502 and discards the answer', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'No Citation Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'A claim with no marker.' });

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);

    expect(JSON.stringify(response.body)).not.toContain(
      'A claim with no marker',
    );
  });

  it('maps an insufficient-evidence response carrying prose to 502', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Prose Refusal Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () =>
      draft({
        status: 'insufficient_evidence',
        answer: 'I cannot answer that.',
      });

    const response = await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);

    expect(response.body).not.toHaveProperty('answer');
    expect(JSON.stringify(response.body)).not.toContain('I cannot answer');
  });

  it('maps unusable provider output to 502', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Unusable Org');
    await seedReadyChunk(organizationId, 'some passage');

    answerProvider.generateImpl = async () => draft({ status: 'answered' });

    await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);
  });

  it('maps an unavailable query embedding to 503 without calling the provider', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Embed Down Org');
    await seedReadyChunk(organizationId, 'some passage');

    embedImpl = async () => {
      throw new EmbeddingUnavailableError('down');
    };

    await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(503);

    expect(answerProvider.calls).toHaveLength(0);
  });

  it('maps a rejected query embedding to 502 without calling the provider', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Embed Bad Org');
    await seedReadyChunk(organizationId, 'some passage');

    embedImpl = async () => {
      throw new EmbeddingRejectedError('bad request');
    };

    await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(502);

    expect(answerProvider.calls).toHaveLength(0);
  });

  it('never sends another organization\u2019s document content to the provider', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const organizationId = await createOrganization(owner.token, 'Tenant A');
    const otherOrganizationId = await createOrganization(
      other.token,
      'Tenant B',
    );

    const myDocumentId = await seedReadyChunk(
      organizationId,
      'ALPHA_ORGANIZATION_SECRET_PASSAGE',
    );
    await seedReadyChunk(
      otherOrganizationId,
      'BETA_OTHER_TENANT_SECRET_PASSAGE',
    );

    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'Alpha only [1].' });

    const response = await ask(owner.token, organizationId, {
      question: 'What is alpha?',
    }).expect(200);

    expect(response.body.citations).toEqual([
      expect.objectContaining({ marker: 1, documentId: myDocumentId }),
    ]);

    expect(answerProvider.calls).toHaveLength(1);
    const prompt = answerProvider.calls[0]!.prompt;
    expect(prompt.user).toContain('ALPHA_ORGANIZATION_SECRET_PASSAGE');
    expect(prompt.user).not.toContain('BETA_OTHER_TENANT_SECRET_PASSAGE');
    expect(JSON.stringify(prompt)).not.toContain(
      'BETA_OTHER_TENANT_SECRET_PASSAGE',
    );
  });

  it('never sends stale-generation or non-READY content to the provider', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Stale Org');

    const currentDocumentId = await seedDocument(organizationId, {
      status: 'READY',
      generation: 2,
    });
    await seedChunk({
      documentId: currentDocumentId,
      organizationId,
      documentGeneration: 2,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'CURRENT_GENERATION_PASSAGE',
      embedding: basis(0),
    });
    await seedChunk({
      documentId: currentDocumentId,
      organizationId,
      documentGeneration: 1,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'OBSOLETE_GENERATION_PASSAGE',
      embedding: basis(0),
    });
    await seedReadyChunk(organizationId, 'PENDING_DOCUMENT_PASSAGE', {
      status: 'PENDING',
    });

    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'Current only [1].' });

    await ask(token, organizationId, {
      question: 'What is alpha?',
    }).expect(200);

    expect(answerProvider.calls).toHaveLength(1);
    const prompt = answerProvider.calls[0]!.prompt;
    expect(prompt.user).toContain('CURRENT_GENERATION_PASSAGE');
    expect(prompt.user).not.toContain('OBSOLETE_GENERATION_PASSAGE');
    expect(prompt.user).not.toContain('PENDING_DOCUMENT_PASSAGE');
  });

  it('logs one line per request without question, passage, or answer content', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Log Org');
    await seedReadyChunk(organizationId, 'PASSAGE_SECRET_MARKER');

    answerProvider.generateImpl = async () =>
      draft({ status: 'answered', answer: 'ANSWER_SECRET_MARKER [1].' });

    await ask(token, organizationId, {
      question: 'QUESTION_SECRET_MARKER?',
    }).expect(200);

    expect(log).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(
      log.mock.calls.map((call) => call[0]),
    );
    expect(serialized).not.toContain('QUESTION_SECRET_MARKER');
    expect(serialized).not.toContain('PASSAGE_SECRET_MARKER');
    expect(serialized).not.toContain('ANSWER_SECRET_MARKER');
    expect(log.mock.calls[0]![0]).toMatchObject({
      status: 'answered',
      sourceCount: 1,
      citationCount: 1,
    });
  });
});
