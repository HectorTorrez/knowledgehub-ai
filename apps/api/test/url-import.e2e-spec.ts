import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { URL_FETCHER } from '../src/documents/url-fetcher.token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../src/storage/object-storage.port.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';
import { FakeObjectStorage } from './support/fake-object-storage.js';

describe('URL import (e2e)', () => {
  let app: INestApplication;
  let realFetcherApp: INestApplication;
  let prisma: PrismaService;
  let sourceText = 'Hello from the web';
  const emails: string[] = [];
  const organizationIds: string[] = [];

  const register = async () => {
    const email = `url-import-${randomUUID()}@example.test`;
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
    if (!cookie) throw new Error('Missing access token cookie');
    return {
      userId: response.body.user.id as string,
      token: cookie.slice(ACCESS_TOKEN_COOKIE.length + 1).split(';')[0],
    };
  };

  const createOrganization = async (token: string) => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'URL import test' })
      .expect(201);
    const id = response.body.organization.id as string;
    organizationIds.push(id);
    return id;
  };

  beforeAll(async () => {
    const createApp = async (fakeFetcher: boolean) => {
      const builder = Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SUMMARIZER)
        .useValue({
          summarize: async () => ({ summary: 'test summary', keyTopics: [] }),
        })
        .overrideProvider(OBJECT_STORAGE)
        .useValue(new FakeObjectStorage());
      if (fakeFetcher) {
        builder.overrideProvider(URL_FETCHER).useValue(async () => ({
          bytes: Buffer.from(sourceText),
          contentType: 'text/plain',
          url: 'https://example.com/notes.txt',
        }));
      }
      const moduleRef = await builder.compile();
      const instance = moduleRef.createNestApplication();
      instance.use(cookieParser());
      await instance.init();
      return instance;
    };
    app = await createApp(true);
    realFetcherApp = await createApp(false);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await realFetcherApp.close();
    await app.close();
  });

  it('imports a fetched document and starts processing', async () => {
    const owner = await register();
    const organizationId = await createOrganization(owner.token);
    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents/import-url`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ url: 'https://example.com/notes.txt' })
      .expect(201);
    expect(response.body.document).toMatchObject({
      sourceUrl: 'https://example.com/notes.txt',
      title: 'notes.txt',
      status: 'PROCESSING',
    });
  });

  it('checks unchanged bytes without reprocessing and versions changed bytes with tenant and SSRF checks', async () => {
    const owner = await register();
    const viewer = await register();
    const organizationId = await createOrganization(owner.token);
    const imported = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents/import-url`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ url: 'https://example.com/notes.txt' })
      .expect(201);
    const documentId = imported.body.document.id as string;
    await prisma.documentProcessingJob.updateMany({
      where: { organizationId, documentId },
      data: { state: 'SUCCEEDED' },
    });
    await prisma.document.updateMany({
      where: { id: documentId, organizationId },
      data: { status: 'READY' },
    });
    const base = `/organizations/${organizationId}/documents/${documentId}/refresh-url`;
    const check = () =>
      request(app.getHttpServer())
        .post(base)
        .set('Authorization', `Bearer ${owner.token}`);
    const unchanged = await check().expect(200);
    expect(unchanged.body.changed).toBe(false);
    expect(unchanged.body.document.generation).toBe(1);
    expect(unchanged.body.document.sourceCheckedAt).toEqual(expect.any(String));
    expect(
      await prisma.documentProcessingJob.count({
        where: { organizationId, documentId },
      }),
    ).toBe(1);
    sourceText = 'Changed source content';
    const updated = await check().expect(200);
    expect(updated.body).toMatchObject({
      changed: true,
      document: { generation: 2, status: 'PROCESSING' },
    });
    expect(
      await prisma.documentVersion.count({
        where: { organizationId, documentId },
      }),
    ).toBe(2);
    await check().expect(409);
    await prisma.membership.create({
      data: { organizationId, userId: viewer.userId, role: 'VIEWER' },
    });
    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(403);
    const foreignOrg = await createOrganization(owner.token);
    await request(app.getHttpServer())
      .post(`/organizations/${foreignOrg}/documents/${documentId}/refresh-url`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await prisma.document.updateMany({
      where: { id: documentId, organizationId },
      data: { status: 'READY', sourceUrl: 'http://127.0.0.1/private' },
    });
    const blocked = await request(realFetcherApp.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
    expect(blocked.body.code).toBe('URL_NOT_ALLOWED');
    sourceText = 'Hello from the web';
  });

  it('rejects loopback URLs using the real fetcher', async () => {
    const owner = await register();
    const organizationId = await createOrganization(owner.token);
    const response = await request(realFetcherApp.getHttpServer())
      .post(`/organizations/${organizationId}/documents/import-url`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ url: 'http://127.0.0.1/x.pdf' })
      .expect(400);
    expect(response.body.code).toBe('URL_NOT_ALLOWED');
  });

  it('rejects non-members', async () => {
    const owner = await register();
    const outsider = await register();
    const organizationId = await createOrganization(owner.token);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents/import-url`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ url: 'https://example.com/notes.txt' })
      .expect(403);
  });

  it('rejects viewers', async () => {
    const owner = await register();
    const viewer = await register();
    const organizationId = await createOrganization(owner.token);
    await prisma.membership.create({
      data: { userId: viewer.userId, organizationId, role: 'VIEWER' },
    });
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents/import-url`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ url: 'https://example.com/notes.txt' })
      .expect(403);
  });
});
