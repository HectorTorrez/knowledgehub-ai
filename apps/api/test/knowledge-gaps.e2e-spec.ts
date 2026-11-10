import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('knowledge gaps (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: string[] = [];
  const organizations: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
  it('keeps tasks tenant-scoped and private, validates assignments and resolves with a document', async () => {
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
      return {
        id: response.body.user.id as string,
        auth: `Bearer ${cookie.slice(ACCESS_TOKEN_COOKIE.length + 1).split(';')[0]}`,
      };
    }
    const owner = await register();
    const other = await register();
    const foreign = await register();
    const org = await prisma.organization.create({
      data: {
        name: 'Gap workspace',
        memberships: {
          create: [
            { userId: owner.id, role: 'OWNER' },
            { userId: other.id, role: 'ADMIN' },
          ],
        },
      },
    });
    const foreignOrg = await prisma.organization.create({
      data: { name: 'Foreign' },
    });
    organizations.push(org.id, foreignOrg.id);
    const answer = await prisma.answer.create({
      data: {
        organizationId: org.id,
        question: 'What is missing?',
        status: 'insufficient_evidence',
        citations: [],
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        createdById: other.id,
        visibility: 'PRIVATE',
      },
    });
    const privateAnswer = await prisma.answer.create({
      data: {
        organizationId: org.id,
        question: 'Private?',
        status: 'insufficient_evidence',
        citations: [],
        conversationId: conversation.id,
      },
    });
    const foreignAnswer = await prisma.answer.create({
      data: {
        organizationId: foreignOrg.id,
        question: 'Foreign?',
        status: 'insufficient_evidence',
        citations: [],
      },
    });
    const document = await prisma.document.create({
      data: { organizationId: org.id, title: 'Resolution' },
    });
    const foreignDocument = await prisma.document.create({
      data: { organizationId: foreignOrg.id, title: 'Foreign resolution' },
    });
    const base = `/organizations/${org.id}/knowledge-gaps`;
    const input = { status: 'OPEN', assigneeId: null, documentId: null };
    const save = (id: string, body: unknown, auth = owner.auth) =>
      request(app.getHttpServer())
        .put(`${base}/${id}`)
        .set('Authorization', auth)
        .send(body);
    await save(answer.id, input).expect(204);
    await save(answer.id, { ...input, assigneeId: foreign.id }).expect(404);
    await save(answer.id, { ...input, documentId: foreignDocument.id }).expect(
      404,
    );
    await save(foreignAnswer.id, input).expect(404);
    await save(privateAnswer.id, input).expect(404);
    await save(privateAnswer.id, input, other.auth).expect(204);
    await save(answer.id, { ...input, status: 'RESOLVED' }).expect(400);
    await save(answer.id, {
      status: 'RESOLVED',
      assigneeId: other.id,
      documentId: document.id,
    }).expect(204);
    const listed = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(listed.body.tasks).toHaveLength(1);
    expect(listed.body.tasks[0]).toMatchObject({
      answerId: answer.id,
      status: 'RESOLVED',
      assigneeId: other.id,
      documentId: document.id,
    });
    await prisma.membership.update({
      where: {
        userId_organizationId: { userId: other.id, organizationId: org.id },
      },
      data: { role: 'VIEWER' },
    });
    await save(answer.id, input, other.auth).expect(403);
    await request(app.getHttpServer())
      .get(base)
      .set('Authorization', other.auth)
      .expect(403);
  });
});
