import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request, { type Response } from 'supertest';
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

  let authA: string;
  let authB: string;
  let ids: string[];
  let routes: Array<['get' | 'post' | 'patch' | 'put' | 'delete', string]>;

  beforeAll(async () => {
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
    authA = await register();
    authB = await register();
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
    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: organizations[0],
        email: `${randomUUID()}@example.test`,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const vector = `[${Array(1536).fill(0).join(',')}]`;
    await prisma.$executeRaw`INSERT INTO "DocumentChunk" ("id", "documentId", "organizationId", "documentGeneration", "pageNumber", "chunkIndex", "content", "characterCount", "embedding", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${document.id}::uuid, ${organizations[0]}::uuid, 1, 1, 0, 'Private', 7, ${vector}::vector, now(), now())`;
    ids = [
      organizations[0],
      users[0],
      document.id,
      collection.id,
      conversation.id,
      answer.id,
      invitation.id,
    ];
    routes = [
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
      ['get', '/knowledge-gaps'],
      ['put', `/knowledge-gaps/${answer.id}`],
      ['get', '/collections'],
      ['post', '/collections'],
      ['patch', `/collections/${collection.id}`],
      ['delete', `/collections/${collection.id}`],
      ['post', '/documents'],
      ['post', '/documents/import-url'],
      ['get', '/documents'],
      ['get', `/documents/${document.id}`],
      ['get', `/documents/${document.id}/download`],
      ['get', `/documents/${document.id}/versions`],
      ['post', `/documents/${document.id}/replacement-upload-url`],
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
      ['delete', `/invitations/${invitation.id}`],
    ];
  });

  it('rejects a nonmember across tenant routes', async () => {
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
  it('rejects foreign resources within a member organization', async () => {
    for (const [method, path] of routes.filter(([, path]) =>
      ids.some((id) => path.includes(id)),
    )) {
      let body = {};
      if (method === 'patch' && path.startsWith('/members/'))
        body = { role: 'MEMBER' };
      if (method === 'patch' && path.startsWith('/collections/'))
        body = { name: 'Updated' };
      if (method === 'patch' && path.startsWith('/documents/'))
        body = { title: 'Updated' };
      if (method === 'patch' && path.startsWith('/conversations/'))
        body = { visibility: 'PRIVATE' };
      if (method === 'put' && path.endsWith('/collections'))
        body = { collectionIds: [] };
      if (method === 'put' && path.endsWith('/feedback'))
        body = { value: 'UP' };
      if (method === 'put' && path.startsWith('/knowledge-gaps/'))
        body = { status: 'OPEN', assigneeId: null, documentId: null };
      if (
        path.endsWith('/upload-url') ||
        path.endsWith('/replacement-upload-url')
      )
        body = { contentType: 'text/plain' };
      const client = request(app.getHttpServer());
      const response = await client[method](
        `/organizations/${organizations[1]}${path}`,
      )
        .set('Authorization', authB)
        .send(body);
      expect([403, 404], `${method} ${path}`).toContain(response.status);
      for (const value of [...ids, 'Private'])
        expect(JSON.stringify(response.body)).not.toContain(value);
    }
  });
  it('keeps list pages and foreign cursors isolated', async () => {
    for (let org = 0; org < 2; org++) {
      for (let i = 0; i < 3; i++) {
        const document = await prisma.document.create({
          data: {
            organizationId: organizations[org],
            title: 'Private',
            status: 'READY',
            generation: 1,
          },
        });
        const conversation = await prisma.conversation.create({
          data: { organizationId: organizations[org], createdById: users[org] },
        });
        const answer = await prisma.answer.create({
          data: {
            organizationId: organizations[org],
            conversationId: conversation.id,
            question: 'Private?',
            status: 'insufficient_evidence',
            citations: [],
          },
        });
        const activity = await prisma.organizationActivity.create({
          data: {
            organizationId: organizations[org],
            actorId: users[org],
            action: 'DOCUMENT_UPLOADED',
            targetType: 'document',
            targetId: document.id,
          },
        });
        if (org === 0)
          ids.push(document.id, conversation.id, answer.id, activity.id);
      }
    }
    for (const path of [
      'documents',
      'conversations',
      'answers',
      'activity',
      'search',
    ]) {
      const query =
        path === 'search' ? { q: 'private', limit: 1 } : { limit: 1 };
      const firstA = await request(app.getHttpServer())
        .get(`/organizations/${organizations[0]}/${path}`)
        .set('Authorization', authA)
        .query(query)
        .expect(200);
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const response: Response = await request(app.getHttpServer())
          .get(`/organizations/${organizations[1]}/${path}`)
          .set('Authorization', authB)
          .query({ ...query, ...(cursor ? { cursor } : {}) })
          .expect(200);
        for (const id of ids)
          expect(JSON.stringify(response.body)).not.toContain(id);
        cursor = response.body.nextCursor ?? null;
        if (cursor) {
          expect(seen.has(cursor)).toBe(false);
          seen.add(cursor);
        }
      } while (cursor);
      if (path !== 'search') {
        expect(firstA.body.nextCursor).toBeTruthy();
        const response: Response = await request(app.getHttpServer())
          .get(`/organizations/${organizations[1]}/${path}`)
          .set('Authorization', authB)
          .query({ ...query, cursor: firstA.body.nextCursor })
          .expect(200);
        for (const id of ids)
          expect(JSON.stringify(response.body)).not.toContain(id);
      }
    }
  });

  it('covers every organization route registered by Nest', () => {
    const normalize = (path: string) =>
      path
        .split('?')[0]
        .replace(/:[^/]+/g, ':id')
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
    const table = new Set(
      routes.map(
        ([method, path]) =>
          `${method} ${normalize(`/organizations/:organizationId${path}`)}`,
      ),
    );
    const server = app.getHttpAdapter().getInstance();
    const registered = server.router.stack.flatMap(
      (layer: {
        route?: { path: string; methods: Record<string, boolean> };
      }) => {
        if (!layer.route?.path.startsWith('/organizations/:organizationId'))
          return [];
        return Object.keys(layer.route.methods).map(
          (method) => `${method} ${normalize(layer.route!.path)}`,
        );
      },
    );
    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((route: string) => !table.has(route))).toEqual([]);
  });
});
