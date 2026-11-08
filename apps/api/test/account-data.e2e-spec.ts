import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/auth/csrf.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';

const password = 'correct horse battery staple';

describe('account data (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARIZER)
      .useValue({ summarize: async () => ({ summary: 'test', keyTopics: [] }) })
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('exports only the caller data and enforces deletion rules', async () => {
    const register = async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `${randomUUID()}@example.test`,
          password,
          firstName: 'Ada',
          lastName: 'Test',
        })
        .expect(201);
      userIds.push(response.body.user.id);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const pairs = cookies.map((cookie) => cookie.split(';')[0]);
      const csrf = pairs
        .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))!
        .slice(CSRF_COOKIE.length + 1);
      return { id: response.body.user.id as string, cookies: pairs, csrf };
    };
    const caller = await register();
    const other = await register();
    const org = await prisma.organization.create({
      data: {
        name: 'Shared',
        memberships: {
          create: [
            { userId: caller.id, role: 'OWNER' },
            { userId: other.id, role: 'MEMBER' },
          ],
        },
      },
    });
    const solo = await prisma.organization.create({
      data: {
        name: 'Solo',
        memberships: { create: { userId: caller.id, role: 'OWNER' } },
      },
    });
    orgIds.push(org.id, solo.id);
    await prisma.conversation.createMany({
      data: [
        { organizationId: org.id, createdById: caller.id, title: 'Mine' },
        { organizationId: org.id, createdById: other.id, title: 'Secret' },
      ],
    });
    const conversation = await prisma.unscoped.conversation.findFirstOrThrow({
      where: { createdById: caller.id },
    });
    await prisma.answer.create({
      data: {
        organizationId: org.id,
        askedById: caller.id,
        conversationId: conversation.id,
        question: 'Conversation question',
        answer: 'Conversation answer',
        status: 'answered',
        citations: [],
      },
    });
    const standalone = await prisma.answer.create({
      data: {
        organizationId: org.id,
        askedById: caller.id,
        question: 'Standalone question',
        answer: 'Standalone answer',
        status: 'answered',
        citations: [],
      },
    });
    await prisma.answerFeedback.create({
      data: {
        answerId: standalone.id,
        userId: caller.id,
        value: 'UP',
        comment: 'Useful',
      },
    });
    const exported = await request(app.getHttpServer())
      .get('/auth/me/export')
      .set('Cookie', caller.cookies)
      .expect(200);
    expect(exported.headers['content-disposition']).toMatch(
      /knowledgehub-export-\d{4}-\d{2}-\d{2}\.json/,
    );
    expect(exported.body.conversations).toHaveLength(1);
    expect(exported.body.conversations[0].answers[0].question).toBe(
      'Conversation question',
    );
    expect(exported.body.answers[0].question).toBe('Standalone question');
    expect(exported.body.feedback[0].comment).toBe('Useful');
    expect(exported.body.memberships).toHaveLength(2);
    expect(JSON.stringify(exported.body)).toContain('Mine');
    expect(JSON.stringify(exported.body)).not.toContain('Secret');
    expect(JSON.stringify(exported.body)).not.toContain('passwordHash');
    const remove = (body: object) =>
      request(app.getHttpServer())
        .delete('/auth/me')
        .set('Cookie', caller.cookies)
        .set('Origin', 'http://localhost:3000')
        .set(CSRF_HEADER, decodeURIComponent(caller.csrf))
        .send(body);
    await remove({ password: 'wrong', confirmation: 'DELETE' }).expect(401);
    await remove({ password }).expect(400);
    const blocked = await remove({ password, confirmation: 'DELETE' }).expect(
      409,
    );
    expect(blocked.body.organizations).toEqual([
      { id: org.id, name: 'Shared' },
    ]);
    await prisma.membership.update({
      where: {
        userId_organizationId: { userId: other.id, organizationId: org.id },
      },
      data: { role: 'OWNER' },
    });
    const deleted = await remove({ password, confirmation: 'DELETE' }).expect(
      204,
    );
    expect(deleted.headers['set-cookie']).toHaveLength(3);
    expect(
      await prisma.organization.findUnique({ where: { id: solo.id } }),
    ).toBeNull();
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', caller.cookies)
      .expect(401);
  });
});
