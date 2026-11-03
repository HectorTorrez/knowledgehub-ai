import { QUERY_REWRITER } from '../src/answers/query-rewriter.port.js';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AnswerConfig } from '../src/answers/answer.config.js';
import { ANSWER_PROVIDER } from '../src/answers/answer-provider.port.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import {
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

function registrationBody() {
  return {
    email: `answers-disabled-${randomUUID()}@example.test`,
    password: PASSWORD,
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
}

function cookieValue(response: request.Response, name: string): string {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }

  return cookie.slice(name.length + 1).split(';')[0];
}

describe('answers disabled (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let answerProvider: FakeAnswerProvider;
  let embed: EmbeddingProvider['embed'];
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();

  const registerUser = async (): Promise<{ userId: string; token: string }> => {
    const body = registrationBody();
    trackedEmails.add(body.email);

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return {
      userId: response.body.user.id as string,
      token: cookieValue(response, ACCESS_TOKEN_COOKIE),
    };
  };

  const createOrganization = async (token: string, name: string) => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    const organizationId = response.body.organization.id as string;
    trackedOrganizationIds.add(organizationId);
    return organizationId;
  };

  beforeAll(async () => {
    embed = vi.fn(async () => [basis(0)]);
    answerProvider = new FakeAnswerProvider();

    const disabledConfig = {
      enabled: false,
      model: 'gpt-4.1-mini',
      maxSources: 8,
      contextMaxChars: 24_000,
      minSimilarity: 0.2,
      maxOutputTokens: 700,
    } as unknown as AnswerConfig;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue({ embed } satisfies EmbeddingProvider)
      .overrideProvider(QUERY_REWRITER)
      .useValue({ rewrite: async (question: string) => question })
      .overrideProvider(ANSWER_PROVIDER)
      .useValue(answerProvider)
      .overrideProvider(AnswerConfig)
      .useValue(disabledConfig)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (trackedOrganizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...trackedOrganizationIds] } },
      });
    }

    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }

    await app.close();
  });

  it('returns 503 without invoking retrieval or the answer provider', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Disabled Org');

    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What is alpha?' })
      .expect(503);

    expect(response.body).not.toHaveProperty('answer');
    expect(response.body).not.toHaveProperty('citations');
    expect(embed).not.toHaveBeenCalled();
    expect(answerProvider.calls).toHaveLength(0);
  });
});
