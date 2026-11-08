import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EMBEDDING_PROVIDER } from '../src/embeddings/embedding-provider.port.js';
import { ANSWER_PROVIDER } from '../src/answers/answer-provider.port.js';
import { FakeEmbeddingProvider } from './support/fake-embedding-provider.js';
import { FakeAnswerProvider } from './support/fake-answer-provider.js';

describe('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: string[] = [];
  const organizations: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(new FakeEmbeddingProvider())
      .overrideProvider(ANSWER_PROVIDER)
      .useValue(new FakeAnswerProvider())
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizations } },
    });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('rejects a nonmember across tenant routes', async () => {
    async function register() {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `${randomUUID()}@example.test`,
          password: 'correct horse battery staple',
          firstName: 'Ada',
          lastName: 'Lovelace',
        })
        .expect(201);
      users.push(response.body.user.id);
      const cookie = (
        response.headers['set-cookie'] as unknown as string[]
      ).find((value) => value.startsWith(`${ACCESS_TOKEN_COOKIE}=`))!;
      return `Bearer ${cookie.slice(ACCESS_TOKEN_COOKIE.length + 1).split(';')[0]}`;
    }
    const authA = await register();
    const authB = await register();
    for (const auth of [authA, authB]) {
      const response = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', auth)
        .send({ name: `Org ${randomUUID()}` })
        .expect(201);
      organizations.push(response.body.organization.id);
    }
    const document = await prisma.document.create({
      data: {
        organizationId: organizations[0],
        title: 'Private',
        status: 'READY',
        generation: 1,
      },
    });
    const collection = await prisma.collection.create({
      data: { organizationId: organizations[0], name: 'Private', color: 'red' },
    });
    const conversation = await prisma.conversation.create({
      data: { organizationId: organizations[0], createdById: users[0] },
    });
    const answer = await prisma.answer.create({
      data: {
        organizationId: organizations[0],
        conversationId: conversation.id,
        question: 'Private?',
        status: 'insufficient_evidence',
        citations: [],
      },
    });
    const ids = [
      organizations[0],
      users[0],
      document.id,
      collection.id,
      conversation.id,
      answer.id,
    ];
    const routes: Array<['get' | 'post' | 'patch' | 'put' | 'delete', string]> =
      [
        ['get', ''],
        ['patch', ''],
        ['delete', ''],
        ['post', '/leave'],
        ['get', '/usage'],
        ['get', '/members'],
        ['post', '/members'],
        ['patch', `/members/${users[0]}`],
        ['delete', `/members/${users[0]}`],
        ['get', '/activity'],
        ['get', '/search?q=private'],
        ['get', '/aggregates/contract-totals'],
        ['get', '/insights'],
        ['get', '/collections'],
        ['post', '/collections'],
        ['patch', `/collections/${collection.id}`],
        ['delete', `/collections/${collection.id}`],
        ['post', '/documents'],
        ['get', '/documents'],
        ['get', `/documents/${document.id}`],
        ['get', `/documents/${document.id}/download`],
        ['patch', `/documents/${document.id}`],
        ['delete', `/documents/${document.id}`],
        ['post', `/documents/${document.id}/reprocess`],
        ['post', `/documents/${document.id}/upload-url`],
        ['post', `/documents/${document.id}/upload-complete`],
        ['put', `/documents/${document.id}/collections`],
        ['post', '/conversations'],
        ['get', '/conversations'],
        ['get', `/conversations/${conversation.id}`],
        ['patch', `/conversations/${conversation.id}`],
        ['get', `/conversations/${conversation.id}/export`],
        ['delete', `/conversations/${conversation.id}`],
        ['post', '/answers'],
        ['get', '/answers'],
        ['get', `/answers/${answer.id}`],
        ['put', `/answers/${answer.id}/feedback`],
        ['delete', `/answers/${answer.id}/feedback`],
        ['delete', `/answers/${answer.id}`],
        ['post', '/invitations'],
        ['get', '/invitations'],
        ['delete', `/invitations/${randomUUID()}`],
      ];
    for (const [method, path] of routes) {
      const client = request(app.getHttpServer());
      const response = await client[method](
        `/organizations/${organizations[0]}${path}`,
      )
        .set('Authorization', authB)
        .send({});
      expect([403, 404], `${method} ${path}`).toContain(response.status);
      for (const id of ids)
        expect(JSON.stringify(response.body)).not.toContain(id);
    }
  });
});
