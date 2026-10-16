import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct horse battery staple';

function validBody() {
  return {
    email: `doc-${randomUUID()}@example.test`,
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

describe('documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();

  const registerUser = async (): Promise<{
    email: string;
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
      email: body.email,
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

  const addMembership = (
    userId: string,
    organizationId: string,
    role: 'OWNER' | 'MEMBER',
  ) => prisma.membership.create({ data: { userId, organizationId, role } });

  const createDocument = (
    token: string,
    organizationId: string,
    body: object,
  ) =>
    request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents`)
      .set(bearer(token))
      .send(body);

  const listDocuments = (token: string, organizationId: string) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents`)
      .set(bearer(token));

  const getDocument = (
    token: string,
    organizationId: string,
    documentId: string,
  ) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents/${documentId}`)
      .set(bearer(token));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  it('rejects unauthenticated requests with 401', async () => {
    const organizationId = randomUUID();
    const documentId = randomUUID();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents`)
      .send({ title: 'Report' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents/${documentId}`)
      .expect(401);
  });

  describe('create', () => {
    it('creates a PENDING document owned by the organization, attributed to the uploader', async () => {
      const { userId, token } = await registerUser();
      const organizationId = await createOrganization(token, 'Create Org');

      const response = await createDocument(token, organizationId, {
        title: 'Quarterly report',
      }).expect(201);

      expect(response.body).toEqual({
        document: {
          id: expect.any(String),
          title: 'Quarterly report',
          status: 'PENDING',
          originalFileName: null,
          contentType: null,
          sizeBytes: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      const { createdAt, updatedAt } = response.body.document;
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
      expect(new Date(updatedAt).toISOString()).toBe(updatedAt);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: response.body.document.id as string },
      });
      expect(document.organizationId).toBe(organizationId);
      expect(document.uploadedById).toBe(userId);
      expect(document.status).toBe('PENDING');
    });

    it('always starts at PENDING even though the model default is the source of truth', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Default Org');

      await createDocument(token, organizationId, { title: 'Doc' }).expect(201);

      const stored = await prisma.document.findMany({
        where: { organizationId },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('PENDING');
    });

    it('attributes the document to the session user, never a body-supplied identity', async () => {
      const owner = await registerUser();
      const member = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Attr Org');
      await addMembership(member.userId, organizationId, 'MEMBER');

      const response = await createDocument(member.token, organizationId, {
        title: 'Member upload',
      }).expect(201);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: response.body.document.id as string },
      });
      expect(document.uploadedById).toBe(member.userId);
      expect(document.organizationId).toBe(organizationId);
    });

    it('trims surrounding whitespace from the title', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Trim Org');

      const response = await createDocument(token, organizationId, {
        title: '  Quarterly report  ',
      }).expect(201);

      expect(response.body.document.title).toBe('Quarterly report');
    });

    it('rejects invalid titles with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Invalid Org');

      const cases: object[] = [
        { title: '' },
        { title: '   ' },
        { title: 'a'.repeat(201) },
        { title: 123 },
        { title: ['Report'] },
        {},
        { title: null },
      ];

      for (const body of cases) {
        await createDocument(token, organizationId, body).expect(400);
      }

      expect(
        await prisma.document.count({ where: { organizationId } }),
      ).toBe(0);
    });

    it('accepts a title of exactly 200 characters', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Max Org');

      await createDocument(token, organizationId, {
        title: 'a'.repeat(200),
      }).expect(201);
    });

    it('rejects unexpected request properties', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Strict Org');

      await createDocument(token, organizationId, {
        title: 'Report',
        status: 'READY',
      }).expect(400);
      await createDocument(token, organizationId, {
        title: 'Report',
        organizationId: randomUUID(),
      }).expect(400);
      await createDocument(token, organizationId, {
        title: 'Report',
        uploadedById: 'someone-else',
      }).expect(400);

      expect(
        await prisma.document.count({ where: { organizationId } }),
      ).toBe(0);
    });

    it('rejects a non-member with 403 and writes nothing', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Guard Org');

      await createDocument(outsider.token, organizationId, {
        title: 'Intrusion',
      }).expect(403);

      expect(
        await prisma.document.count({ where: { organizationId } }),
      ).toBe(0);
    });

    it('rejects a malformed organization id with 400', async () => {
      const { token } = await registerUser();

      for (const malformed of ['not-a-uuid', '123', 'null']) {
        await createDocument(token, malformed, { title: 'Report' }).expect(400);
      }
    });

    it('exposes only approved public document fields', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Fields Org');

      const response = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);

      expect(Object.keys(response.body.document).sort()).toEqual(
        [
          'contentType',
          'createdAt',
          'id',
          'originalFileName',
          'sizeBytes',
          'status',
          'title',
          'updatedAt',
        ].sort(),
      );

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('uploadedById');
      expect(serialized).not.toContain('failureReason');
      expect(serialized).not.toContain('organizationId');
    });
  });

  describe('list', () => {
    it('returns an empty list for a newly created organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Empty Org');

      const response = await listDocuments(token, organizationId).expect(200);
      expect(response.body).toEqual({ documents: [] });
    });

    it('returns only the documents belonging to the authorized organization', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Scope A');
      const otherOrganizationId = await createOrganization(
        other.token,
        'Scope B',
      );

      const mine = await createDocument(owner.token, organizationId, {
        title: 'Mine',
      }).expect(201);
      await createDocument(other.token, otherOrganizationId, {
        title: 'Theirs',
      }).expect(201);

      const response = await listDocuments(owner.token, organizationId).expect(
        200,
      );

      expect(response.body.documents.map((doc: { id: string }) => doc.id)).toEqual(
        [mine.body.document.id],
      );
      expect(JSON.stringify(response.body)).not.toContain('Theirs');
    });

    it('orders documents deterministically by creation time then id descending', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Order Org');

      for (const title of ['First', 'Second', 'Third']) {
        await createDocument(token, organizationId, { title }).expect(201);
      }

      const response = await listDocuments(token, organizationId).expect(200);
      const actualIds = response.body.documents.map(
        (doc: { id: string }) => doc.id,
      );

      const expected = await prisma.document.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });

      expect(actualIds).toEqual(expected.map((doc) => doc.id));
    });

    it('rejects a non-member with 403', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const organizationId = await createOrganization(owner.token, 'List Org');

      await listDocuments(outsider.token, organizationId).expect(403);
    });

    it('rejects a malformed organization id with 400', async () => {
      const { token } = await registerUser();

      for (const malformed of ['not-a-uuid', '123', 'null']) {
        await listDocuments(token, malformed).expect(400);
      }
    });

    it('exposes only approved public document fields', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'List Fields Org');

      await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);

      const response = await listDocuments(token, organizationId).expect(200);
      const [first] = response.body.documents;

      expect(Object.keys(first).sort()).toEqual(
        [
          'contentType',
          'createdAt',
          'id',
          'originalFileName',
          'sizeBytes',
          'status',
          'title',
          'updatedAt',
        ].sort(),
      );

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('uploadedById');
      expect(serialized).not.toContain('failureReason');
      expect(serialized).not.toContain('organizationId');
    });
  });

  describe('detail', () => {
    it('returns the document when it belongs to the authorized organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Detail Org');

      const created = await createDocument(token, organizationId, {
        title: 'Quarterly report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const response = await getDocument(
        token,
        organizationId,
        documentId,
      ).expect(200);

      expect(response.body).toEqual({
        document: {
          id: documentId,
          title: 'Quarterly report',
          status: 'PENDING',
          originalFileName: null,
          contentType: null,
          sizeBytes: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('returns 404 when the document exists only in another organization', async () => {
      const ownerA = await registerUser();
      const ownerB = await registerUser();
      const organizationA = await createOrganization(ownerA.token, 'Tenant A');
      const organizationB = await createOrganization(ownerB.token, 'Tenant B');

      const created = await createDocument(ownerA.token, organizationA, {
        title: 'Secret',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await getDocument(ownerB.token, organizationB, documentId).expect(404);
    });

    it('returns 404 when the document does not exist in the organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Missing Org');

      await getDocument(token, organizationId, randomUUID()).expect(404);
    });

    it('returns 403 for an authenticated non-member', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Guard D');

      const created = await createDocument(owner.token, organizationId, {
        title: 'Report',
      }).expect(201);

      await getDocument(
        outsider.token,
        organizationId,
        created.body.document.id as string,
      ).expect(403);
    });

    it('rejects a malformed document id with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Malformed Org');

      for (const malformed of ['not-a-uuid', '123', 'null']) {
        await getDocument(token, organizationId, malformed).expect(400);
      }
    });
  });
});
