import { SUMMARIZER } from '../src/summaries/summarizer.js';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('activity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const organizations: string[] = [];

  async function register() {
    const email = `activity-${randomUUID()}@example.test`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'correct horse battery staple',
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
      .expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) =>
      value.startsWith(`${ACCESS_TOKEN_COOKIE}=`),
    );
    if (!cookie) throw new Error('Missing access token');
    return {
      userId: response.body.user.id as string,
      token: cookie.slice(ACCESS_TOKEN_COOKIE.length + 1).split(';')[0],
    };
  }

  async function createOrganization(token: string) {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original' })
      .expect(201);
    const id = response.body.organization.id as string;
    organizations.push(id);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARIZER)
      .useValue({
        summarize: async () => ({ summary: 'test summary', keyTopics: [] }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizations } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('restricts activity to owners and isolates organization events', async () => {
    const owner = await register();
    const member = await register();
    const outsider = await register();
    const viewer = await register();
    const admin = await register();
    const organizationId = await createOrganization(owner.token);
    const otherId = await createOrganization(owner.token);
    await prisma.membership.create({
      data: { organizationId, userId: member.userId, role: 'MEMBER' },
    });
    await prisma.membership.createMany({
      data: [
        { organizationId, userId: viewer.userId, role: 'VIEWER' },
        { organizationId, userId: admin.userId, role: 'ADMIN' },
      ],
    });
    for (const [id, name] of [
      [organizationId, 'Renamed'],
      [otherId, 'Other renamed'],
    ]) {
      await request(app.getHttpServer())
        .patch(`/organizations/${id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name })
        .expect(200);
    }
    const url = `/organizations/${organizationId}/activity`;
    const response = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(response.body.activities).toHaveLength(1);
    expect(response.body.activities[0]).toMatchObject({
      action: 'ORGANIZATION_RENAMED',
      actor: { id: owner.userId },
      targetId: organizationId,
      metadata: { from: 'Original', to: 'Renamed' },
    });
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${url}?actorId=invalid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}?action=INVALID`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}?from=invalid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}?to=invalid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
    for (const query of [
      `action=DOCUMENT_DELETED`,
      `actorId=${member.userId}`,
      'from=2099-01-01T00%3A00%3A00Z',
      'to=2000-01-01T00%3A00%3A00Z',
    ]) {
      const filtered = await request(app.getHttpServer())
        .get(`${url}?${query}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(filtered.body.activities).toHaveLength(0);
    }
    await prisma.organizationActivity.createMany({
      data: [1, 2, 3].map((n) => ({
        organizationId,
        actorId: owner.userId,
        action: 'DOCUMENT_DELETED',
        targetType: 'document',
        targetId: String(n),
        metadata: {},
      })),
    });
    const filter = `action=DOCUMENT_DELETED,ORGANIZATION_RENAMED&actorId=${owner.userId}&from=2000-01-01T00%3A00%3A00Z&to=2099-01-01T00%3A00%3A00Z&limit=2`;
    const first = await request(app.getHttpServer())
      .get(`${url}?${filter}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(`${url}?${filter}&cursor=${first.body.nextCursor}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(first.body.activities).toHaveLength(2);
    expect(second.body.activities).toHaveLength(2);
    expect(
      new Set(
        [...first.body.activities, ...second.body.activities].map(
          (item: { id: string }) => item.id,
        ),
      ).size,
    ).toBe(4);
    expect(second.body.nextCursor).toBeNull();
    await request(app.getHttpServer())
      .get(`${url}?limit=invalid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });
});
