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

describe('collections (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: string[] = [];
  const organizations: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDING_PROVIDER).useValue(new FakeEmbeddingProvider())
      .overrideProvider(ANSWER_PROVIDER).useValue(new FakeAnswerProvider()).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('enforces permissions, tenant boundaries, and replacement semantics', async () => {
    async function register() {
      const response = await request(app.getHttpServer()).post('/auth/register').send({ email: `${randomUUID()}@example.test`, password: 'correct horse battery staple', firstName: 'Ada', lastName: 'Lovelace' }).expect(201);
      users.push(response.body.user.id);
      const cookie = (response.headers['set-cookie'] as unknown as string[]).find(value => value.startsWith(`${ACCESS_TOKEN_COOKIE}=`))!;
      return { id: response.body.user.id as string, auth: `Bearer ${cookie.slice(ACCESS_TOKEN_COOKIE.length + 1).split(';')[0]}` };
    }
    const owner = await register();
    const viewer = await register();
    async function organization() {
      const result = await request(app.getHttpServer()).post('/organizations').set('Authorization', owner.auth).send({ name: `Org ${randomUUID()}` }).expect(201);
      organizations.push(result.body.organization.id);
      return result.body.organization.id as string;
    }
    const org = await organization();
    const foreignOrg = await organization();
    await prisma.membership.create({ data: { userId: viewer.id, organizationId: org, role: 'VIEWER' } });
    const base = `/organizations/${org}`;
    const foreignBase = `/organizations/${foreignOrg}`;
    const collection = (await request(app.getHttpServer()).post(`${base}/collections`).set('Authorization', owner.auth).send({ name: 'Reports', color: '#ffffff' }).expect(201)).body;
    await request(app.getHttpServer()).post(`${base}/collections`).set('Authorization', owner.auth).send({ name: 'reports', color: '#000000' }).expect(409);
    await request(app.getHttpServer()).post(`${base}/collections`).set('Authorization', viewer.auth).send({ name: 'No', color: 'red' }).expect(403);
    const foreign = (await request(app.getHttpServer()).post(`${foreignBase}/collections`).set('Authorization', owner.auth).send({ name: 'Foreign', color: 'red' }).expect(201)).body;
    const document = await prisma.document.create({ data: { organizationId: org, title: 'Report' } });
    const foreignDocument = await prisma.document.create({ data: { organizationId: foreignOrg, title: 'Foreign' } });
    await request(app.getHttpServer()).put(`${base}/documents/${document.id}/collections`).set('Authorization', owner.auth).send({ collectionIds: [foreign.id] }).expect(404);
    await request(app.getHttpServer()).put(`${base}/documents/${foreignDocument.id}/collections`).set('Authorization', owner.auth).send({ collectionIds: [collection.id] }).expect(404);
    await request(app.getHttpServer()).put(`${base}/documents/${document.id}/collections`).set('Authorization', viewer.auth).send({ collectionIds: [collection.id] }).expect(403);
    await request(app.getHttpServer()).put(`${base}/documents/${document.id}/collections`).set('Authorization', owner.auth).send({ collectionIds: [collection.id] }).expect(204);
    const listed = await request(app.getHttpServer()).get(`${base}/documents`).query({ collectionId: collection.id }).set('Authorization', viewer.auth).expect(200);
    expect(listed.body.documents.map((item: { id: string }) => item.id)).toEqual([document.id]);
    expect(listed.body.documents[0].collections).toEqual([{ id: collection.id, name: 'Reports', color: '#ffffff' }]);
    const search = await request(app.getHttpServer()).get(`${base}/search`).query({ q: 'report', collectionIds: collection.id }).set('Authorization', owner.auth).expect(200);
    expect(search.body.results).toEqual([]);
    await request(app.getHttpServer()).get(`${base}/search`).query({ q: 'report', collectionIds: foreign.id }).set('Authorization', owner.auth).expect(404);
    const answer = await request(app.getHttpServer()).post(`${base}/answers`).set('Authorization', owner.auth).send({ question: 'What is in the report?', collectionIds: [collection.id] }).expect(200);
    expect(answer.body.status).toBe('insufficient_evidence');
    await request(app.getHttpServer()).post(`${base}/answers`).set('Authorization', owner.auth).send({ question: 'What is in the report?', collectionIds: [foreign.id] }).expect(404);
    await request(app.getHttpServer()).patch(`${base}/collections/${foreign.id}`).set('Authorization', owner.auth).send({ name: 'No' }).expect(404);
    await request(app.getHttpServer()).patch(`${base}/collections/${collection.id}`).set('Authorization', owner.auth).send({ name: 'New' }).expect(200);
    await request(app.getHttpServer()).delete(`${base}/collections/${collection.id}`).set('Authorization', owner.auth).expect(204);
  });
});
