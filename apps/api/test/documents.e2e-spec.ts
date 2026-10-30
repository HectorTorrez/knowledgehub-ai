import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../src/storage/object-storage.port.js';
import { MAX_UPLOAD_BYTES } from '../src/documents/upload-policy.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import { FakeObjectStorage } from './support/fake-object-storage.js';

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
  let storage: FakeObjectStorage;
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

  const getDownloadUrl = (
    token: string,
    organizationId: string,
    documentId: string,
  ) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents/${documentId}/download`)
      .set(bearer(token));

  const renameDocument = (
    token: string,
    organizationId: string,
    documentId: string,
    body: object,
  ) =>
    request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/documents/${documentId}`)
      .set(bearer(token))
      .send(body);

  const deleteDocument = (
    token: string,
    organizationId: string,
    documentId: string,
  ) =>
    request(app.getHttpServer())
      .delete(`/organizations/${organizationId}/documents/${documentId}`)
      .set(bearer(token));

  const createUploadUrl = (
    token: string,
    organizationId: string,
    documentId: string,
    body: object,
  ) =>
    request(app.getHttpServer())
      .post(`/organizations/${organizationId}/documents/${documentId}/upload-url`)
      .set(bearer(token))
      .send(body);

  const completeUpload = (
    token: string,
    organizationId: string,
    documentId: string,
    body: object = {},
  ) =>
    request(app.getHttpServer())
      .post(
        `/organizations/${organizationId}/documents/${documentId}/upload-complete`,
      )
      .set(bearer(token))
      .send(body);

  const loadDocument = (documentId: string) =>
    prisma.document.findUniqueOrThrow({ where: { id: documentId } });

  const loadJobs = (documentId: string) =>
    prisma.documentProcessingJob.findMany({
      where: { documentId },
      orderBy: { createdAt: 'asc' },
    });

  const uploadUrlAndObject = async (
    token: string,
    organizationId: string,
    documentId: string,
    contentType: string,
    bytes: Uint8Array | string,
    objectContentType: string | null = contentType,
  ): Promise<string> => {
    await createUploadUrl(token, organizationId, documentId, {
      contentType,
    }).expect(200);

    const document = await loadDocument(documentId);
    const key = document.uploadStorageKey as string;
    storage.putObject(key, bytes, objectContentType);

    return key;
  };

  beforeAll(async () => {
    storage = new FakeObjectStorage();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
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
    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/documents/${documentId}/download`)
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationId}/documents/${documentId}/upload-url`,
      )
      .send({ contentType: 'application/pdf' })
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationId}/documents/${documentId}/upload-complete`,
      )
      .send({})
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
          failureReason: null,
          failureKind: null,
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
          'failureKind',
          'failureReason',
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
      expect(serialized).not.toContain('uploadStorageKey');
      expect(serialized).not.toContain('uploadedById');
      expect(serialized).not.toContain('organizationId');
    });
  });

  describe('list', () => {
    it('returns an empty list for a newly created organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Empty Org');

      const response = await listDocuments(token, organizationId).expect(200);
      expect(response.body).toEqual({ documents: [], nextCursor: null });
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
          'failureKind',
          'failureReason',
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
      expect(serialized).not.toContain('uploadStorageKey');
      expect(serialized).not.toContain('uploadedById');
      expect(serialized).not.toContain('organizationId');
    });

    it('paginates with a limit and cursor', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Paged Org');

      for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
        await createDocument(token, organizationId, { title }).expect(201);
      }

      const ordered = await prisma.document.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      const ids = ordered.map((doc) => doc.id);

      const firstPage = await listDocuments(token, organizationId)
        .query({ limit: '2' })
        .expect(200);

      expect(
        firstPage.body.documents.map((d: { id: string }) => d.id),
      ).toEqual(ids.slice(0, 2));
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await listDocuments(token, organizationId)
        .query({ limit: '2', cursor: firstPage.body.nextCursor as string })
        .expect(200);

      expect(
        secondPage.body.documents.map((d: { id: string }) => d.id),
      ).toEqual(ids.slice(2, 4));

      const lastPage = await listDocuments(token, organizationId)
        .query({ limit: '2', cursor: secondPage.body.nextCursor as string })
        .expect(200);

      expect(
        lastPage.body.documents.map((d: { id: string }) => d.id),
      ).toEqual(ids.slice(4));
      expect(lastPage.body.nextCursor).toBeNull();
    });
  });

  describe('rename', () => {
    it('renames a document and returns the updated document', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Rename Org');

      const created = await createDocument(token, organizationId, {
        title: 'Before',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const response = await renameDocument(token, organizationId, documentId, {
        title: 'After',
      }).expect(200);

      expect(response.body.document.title).toBe('After');
      expect(await loadDocument(documentId)).toMatchObject({ title: 'After' });
    });

    it('returns 404 for a document in another organization', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Rename A');
      const otherOrganizationId = await createOrganization(other.token, 'Rename B');

      const created = await createDocument(owner.token, organizationId, {
        title: 'Private',
      }).expect(201);

      await renameDocument(
        other.token,
        otherOrganizationId,
        created.body.document.id,
        { title: 'Nope' },
      ).expect(404);
    });

    it('rejects an invalid title with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Rename C');
      const created = await createDocument(token, organizationId, {
        title: 'Valid',
      }).expect(201);

      await renameDocument(token, organizationId, created.body.document.id, {
        title: '   ',
      }).expect(400);
    });
  });

  describe('delete', () => {
    it('removes the document row and returns 404 afterwards', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Delete Org');

      const created = await createDocument(token, organizationId, {
        title: 'Doomed',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await deleteDocument(token, organizationId, documentId).expect(204);
      await expect(loadDocument(documentId)).rejects.toThrow();
      await getDocument(token, organizationId, documentId).expect(404);
    });

    it('returns 404 for a document in another organization', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Delete A');
      const otherOrganizationId = await createOrganization(other.token, 'Delete B');

      const created = await createDocument(owner.token, organizationId, {
        title: 'Mine',
      }).expect(201);

      await deleteDocument(
        other.token,
        otherOrganizationId,
        created.body.document.id,
      ).expect(404);
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
          failureReason: null,
          failureKind: null,
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

  describe('download', () => {
    beforeEach(() => {
      storage.downloadCalls.length = 0;
    });

    const createVerifiedDocument = async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(
        token,
        'Download Org',
      );
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, {
        contentType: 'application/pdf',
      }).expect(200);

      const pending = await loadDocument(documentId);
      storage.putObject(
        pending.uploadStorageKey as string,
        '%PDF-1.7\noriginal body',
        'application/pdf',
      );

      await completeUpload(token, organizationId, documentId).expect(200);
      const verified = await loadDocument(documentId);

      return {
        token,
        organizationId,
        documentId,
        verifiedKey: verified.storageKey as string,
      };
    };

    it('returns a presigned read URL for a document with a verified original', async () => {
      const { token, organizationId, documentId, verifiedKey } =
        await createVerifiedDocument();

      const response = await getDownloadUrl(
        token,
        organizationId,
        documentId,
      ).expect(200);

      expect(response.body).toEqual({
        url: `https://fake-object-storage.test/${verifiedKey}?download=1`,
        expiresAt: expect.any(String),
      });
      expect(new Date(response.body.expiresAt).toISOString()).toBe(
        response.body.expiresAt,
      );
      expect(Object.keys(response.body).sort()).toEqual(
        ['expiresAt', 'url'].sort(),
      );
      expect(storage.downloadCalls).toHaveLength(1);
      expect(storage.downloadCalls[0].key).toBe(verifiedKey);
    });

    it('rejects a document whose upload has not been verified with 409', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Pending Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);

      await getDownloadUrl(
        token,
        organizationId,
        created.body.document.id as string,
      ).expect(409);
    });

    it('rejects a verified document whose object is gone with 409', async () => {
      const { token, organizationId, documentId, verifiedKey } =
        await createVerifiedDocument();
      storage.removeObject(verifiedKey);

      await getDownloadUrl(token, organizationId, documentId).expect(409);
      expect(storage.downloadCalls).toHaveLength(0);
    });

    it('returns 404 for a document in another organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Other Org');

      await getDownloadUrl(token, organizationId, randomUUID()).expect(404);
    });

    it('returns 403 for an authenticated non-member', async () => {
      const { organizationId, documentId } = await createVerifiedDocument();
      const outsider = await registerUser();

      await getDownloadUrl(
        outsider.token,
        organizationId,
        documentId,
      ).expect(403);
    });

    it('rejects a malformed document id with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Malformed Org');

      await getDownloadUrl(token, organizationId, 'not-a-uuid').expect(400);
    });
  });

  describe('upload url', () => {
    const body = { contentType: 'application/pdf' };

    const lastCall = () => storage.calls[storage.calls.length - 1];

    beforeEach(() => {
      storage.calls.length = 0;
      storage.onPresign = null;
    });

    it('returns a presigned PUT upload for a document in the organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Upload Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const response = await createUploadUrl(
        token,
        organizationId,
        documentId,
        body,
      ).expect(200);

      expect(response.body).toEqual({
        uploadUrl: expect.stringContaining('https://fake-object-storage.test/'),
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        expiresAt: expect.any(String),
        maxSizeBytes: MAX_UPLOAD_BYTES,
      });
      expect(new Date(response.body.expiresAt).toISOString()).toBe(
        response.body.expiresAt,
      );
      expect(Object.keys(response.body).sort()).toEqual(
        ['expiresAt', 'headers', 'maxSizeBytes', 'method', 'uploadUrl'].sort(),
      );
    });

    it('stores the fresh key while the document stays PENDING without verified file metadata', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Lifecycle Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, {
        ...body,
        sizeBytes: 1024,
      }).expect(200);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });

      expect(document.status).toBe('PENDING');
      expect(document.sizeBytes).toBeNull();
      expect(document.contentType).toBeNull();
      expect(document.originalFileName).toBeNull();
      expect(document.storageKey).toBeNull();
      expect(document.expectedContentType).toBe('application/pdf');
      expect(document.uploadStorageKey).toBe(lastCall().key);
      expect(document.uploadStorageKey).toMatch(
        new RegExp(
          `^organizations/${organizationId}/documents/${documentId}/`,
        ),
      );
    });

    it('generates a fresh key on every request and replaces the persisted key', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Fresh Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );
      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );

      expect(storage.calls).toHaveLength(2);
      expect(storage.calls[0].key).not.toBe(storage.calls[1].key);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.storageKey).toBeNull();
      expect(document.uploadStorageKey).toBe(storage.calls[1].key);
    });

    it('supersedes the staging key on a retry after a previous upload attempt', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Retry Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );
      const firstKey = storage.calls[0].key;
      storage.putObject(firstKey, '%PDF-1.4 first attempt', 'application/pdf');

      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.uploadStorageKey).toBe(storage.calls[1].key);
      expect(document.uploadStorageKey).not.toBe(firstKey);
      expect(document.storageKey).toBeNull();
    });

    it('never overwrites an existing verified storage key when a new upload URL is requested', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Verified Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const verifiedKey = `organizations/${organizationId}/documents/${documentId}/verified/existing`;
      await prisma.document.update({
        where: { id: documentId },
        data: { storageKey: verifiedKey },
      });

      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.storageKey).toBe(verifiedKey);
      expect(document.uploadStorageKey).toBe(storage.calls[0].key);
      expect(document.uploadStorageKey).not.toBe(verifiedKey);
    });

    it('rejects an upload URL for a document that has already started processing, leaving it untouched', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Closed Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const verifiedKey = `organizations/${organizationId}/documents/${documentId}/verified/existing`;
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'PROCESSING', storageKey: verifiedKey },
      });

      await createUploadUrl(token, organizationId, documentId, body).expect(
        409,
      );

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PROCESSING');
      expect(document.storageKey).toBe(verifiedKey);
      expect(storage.calls).toHaveLength(0);
    });

    it('rejects an upload URL for a READY document with 409', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Ready Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'READY' },
      });

      await createUploadUrl(token, organizationId, documentId, body).expect(
        409,
      );

      expect(storage.calls).toHaveLength(0);
    });

    it('passes the configured upload TTL to the storage port', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Ttl Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, body).expect(
        200,
      );

      expect(lastCall().expiresInSeconds).toBe(900);
    });

    it('returns 404 when the document belongs to another organization and leaves it untouched', async () => {
      const ownerA = await registerUser();
      const ownerB = await registerUser();
      const organizationA = await createOrganization(ownerA.token, 'Upload A');
      const organizationB = await createOrganization(ownerB.token, 'Upload B');
      const created = await createDocument(ownerA.token, organizationA, {
        title: 'Secret',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(
        ownerB.token,
        organizationB,
        documentId,
        body,
      ).expect(404);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.uploadStorageKey).toBeNull();
      expect(storage.calls).toHaveLength(0);
    });

    it('returns 404 when the document does not exist in the organization', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Missing Upload');

      await createUploadUrl(
        token,
        organizationId,
        randomUUID(),
        body,
      ).expect(404);
    });

    it('returns 403 for an authenticated non-member and writes nothing', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const organizationId = await createOrganization(owner.token, 'Guard U');
      const created = await createDocument(owner.token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(
        outsider.token,
        organizationId,
        documentId,
        body,
      ).expect(403);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.uploadStorageKey).toBeNull();
    });

    it('rejects an unsupported content type, extra fields, and an invalid size with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Invalid Upload');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const cases: object[] = [
        { contentType: 'image/png' },
        { contentType: 'application/pdf', documentId: randomUUID() },
        { contentType: 'application/pdf', storageKey: 'organizations/x' },
        { contentType: 'application/pdf', uploadStorageKey: 'organizations/x' },
        { contentType: 'application/pdf', sizeBytes: 0 },
        { contentType: 'application/pdf', sizeBytes: -1 },
        {},
      ];

      for (const invalid of cases) {
        await createUploadUrl(
          token,
          organizationId,
          documentId,
          invalid,
        ).expect(400);
      }

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.uploadStorageKey).toBeNull();
      expect(storage.calls).toHaveLength(0);
    });

    it('rejects a declared size above the policy cap with 413 and writes nothing', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Too Large Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, {
        contentType: 'application/pdf',
        sizeBytes: MAX_UPLOAD_BYTES + 1,
      }).expect(413);

      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.uploadStorageKey).toBeNull();
      expect(storage.calls).toHaveLength(0);
    });

    it('accepts a declared size exactly at the policy cap', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Cap Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, organizationId, documentId, {
        contentType: 'application/pdf',
        sizeBytes: MAX_UPLOAD_BYTES,
      }).expect(200);
    });

    it('does not return the presigned URL when persisting the key fails', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Write Fail Org');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      storage.onPresign = async () => {
        await prisma.document.delete({ where: { id: documentId } });
      };

      const response = await createUploadUrl(
        token,
        organizationId,
        documentId,
        body,
      );

      expect(storage.calls).toHaveLength(1);
      expect(response.status).not.toBe(200);
      expect(response.body).not.toHaveProperty('uploadUrl');
      expect(JSON.stringify(response.body)).not.toContain(
        'fake-object-storage.test',
      );
    });

    it('rejects malformed organization and document ids with 400', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Malformed Ids');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      await createUploadUrl(token, 'not-a-uuid', documentId, body).expect(400);
      await createUploadUrl(
        token,
        organizationId,
        'not-a-uuid',
        body,
      ).expect(400);
    });

    it('exposes only the approved upload-url fields', async () => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, 'Fields Upload');
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;

      const response = await createUploadUrl(
        token,
        organizationId,
        documentId,
        body,
      ).expect(200);

      expect(response.body).not.toHaveProperty('storageKey');
      expect(response.body).not.toHaveProperty('uploadStorageKey');
      expect(Object.keys(response.body).sort()).toEqual(
        ['expiresAt', 'headers', 'maxSizeBytes', 'method', 'uploadUrl'].sort(),
      );
    });
  });

  describe('upload complete', () => {
    const pdfBytes = '%PDF-1.7\nverified body';
    const encoder = new TextEncoder();

    const originalInspectObject = (key: string) =>
      FakeObjectStorage.prototype.inspectObject.call(storage, key);

    const setupDocument = async (name: string) => {
      const { token } = await registerUser();
      const organizationId = await createOrganization(token, name);
      const created = await createDocument(token, organizationId, {
        title: 'Report',
      }).expect(201);

      return {
        token,
        organizationId,
        documentId: created.body.document.id as string,
      };
    };

    beforeEach(() => {
      storage.calls.length = 0;
      storage.onPresign = null;
      storage.onInspectObject = null;
      storage.onReadObjectPrefix = null;
      storage.onCopyObject = null;
      delete (storage as unknown as Record<string, unknown>).inspectObject;
      delete (storage as unknown as Record<string, unknown>)
        .readObjectPrefix;
      delete (storage as unknown as Record<string, unknown>).copyObject;
    });

    it('verifies a valid upload, promotes it and transitions to PROCESSING', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Verify Org',
      );
      const stagingKey = await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      const response = await completeUpload(token, organizationId, documentId, {
        originalFileName: '  report.pdf  ',
      }).expect(200);

      expect(response.body.document).toEqual({
        id: documentId,
        title: 'Report',
        status: 'PROCESSING',
        originalFileName: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: encoder.encode(pdfBytes).byteLength,
        failureReason: null,
        failureKind: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PROCESSING');
      expect(document.uploadStorageKey).toBe(stagingKey);
      expect(document.expectedContentType).toBe('application/pdf');
      expect(document.failureReason).toBeNull();
      expect(document.failureKind).toBeNull();
      expect(document.storageKey).not.toBeNull();
      expect(document.storageKey).not.toBe(stagingKey);
      expect(document.storageKey).toMatch(
        new RegExp(`^organizations/${organizationId}/documents/${documentId}/verified/`),
      );

      const promoted = await storage.inspectObject(
        document.storageKey as string,
      );
      const promotedBytes = await storage.readObjectPrefix({
        key: document.storageKey as string,
        maxBytes: 1024,
        version: promoted?.version ?? '',
      });
      expect(new TextDecoder().decode(promotedBytes)).toBe(pdfBytes);

      expect(document.generation).toBe(1);
      const jobs = await loadJobs(documentId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        state: 'QUEUED',
        attempt: 0,
        documentGeneration: 1,
        verifiedStorageKey: document.storageKey,
        organizationId,
      });
    });

    it('accepts a request with no body', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'No Body Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      await request(app.getHttpServer())
        .post(
          `/organizations/${organizationId}/documents/${documentId}/upload-complete`,
        )
        .set(bearer(token))
        .expect(200);
    });

    it('keeps the verified bytes when a reused staging URL overwrites the staging object', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Reuse Org',
      );
      const stagingKey = await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      await completeUpload(token, organizationId, documentId).expect(200);
      const verified = await loadDocument(documentId);
      const verifiedKey = verified.storageKey as string;
      const verifiedSize = verified.sizeBytes;

      storage.putObject(stagingKey, '%PDF-1.7 different bytes', 'application/pdf');

      const reloaded = await loadDocument(documentId);
      expect(reloaded.storageKey).toBe(verifiedKey);
      expect(reloaded.sizeBytes).toBe(verifiedSize);

      const promoted = await storage.inspectObject(verifiedKey);
      const bytes = await storage.readObjectPrefix({
        key: verifiedKey,
        maxBytes: 1024,
        version: promoted?.version ?? '',
      });
      expect(new TextDecoder().decode(bytes)).toBe(pdfBytes);
    });

    it('rejects with 409 when the staging object changes mid-verification and promotes nothing', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Race Org',
      );
      const stagingKey = await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      storage.onReadObjectPrefix = () => {
        storage.putObject(stagingKey, '%PDF-1.7 replaced', 'application/pdf');
      };

      await completeUpload(token, organizationId, documentId).expect(409);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('rejects with 409 without changing state when the object was never uploaded', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Absent Org',
      );
      await createUploadUrl(token, organizationId, documentId, {
        contentType: 'application/pdf',
      }).expect(200);

      await completeUpload(token, organizationId, documentId).expect(409);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('rejects with 409 when no upload URL was ever requested', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Never Uploaded Org',
      );

      await completeUpload(token, organizationId, documentId).expect(409);

      const document = await loadDocument(documentId);
      expect(document.uploadStorageKey).toBeNull();
      expect(document.status).toBe('PENDING');
    });

    it('fails the document for a zero-byte object with EMPTY_OBJECT', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Empty Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        new Uint8Array(),
      );

      const response = await completeUpload(token, organizationId, documentId)
        .expect(200)
        .expect(({ body }) => {
          expect(body.document.status).toBe('FAILED');
          expect(body.document.failureReason).toBe('EMPTY_OBJECT');
          expect(body.document.failureKind).toBe('VERIFICATION');
        });

      expect(response.body.document).not.toHaveProperty('storageKey');
      const document = await loadDocument(documentId);
      expect(document.storageKey).toBeNull();
      expect(document.failureKind).toBe('VERIFICATION');
      expect(document.generation).toBe(0);
      expect(await loadJobs(documentId)).toHaveLength(0);
    });

    it('fails the document for an oversized object with SIZE_LIMIT_EXCEEDED', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Oversize Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );
      storage.inspectObject = async (key) => ({
        key,
        sizeBytes: MAX_UPLOAD_BYTES + 1,
        contentType: 'application/pdf',
        version: 'version-1',
      });

      await completeUpload(token, organizationId, documentId)
        .expect(200)
        .expect(({ body }) => {
          expect(body.document.failureReason).toBe('SIZE_LIMIT_EXCEEDED');
          expect(body.document.failureKind).toBe('VERIFICATION');
        });

      expect((await loadDocument(documentId)).status).toBe('FAILED');
    });

    it('fails the document for a disallowed stored type with CONTENT_TYPE_NOT_ALLOWED', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Disallowed Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
        'image/png',
      );

      await completeUpload(token, organizationId, documentId)
        .expect(200)
        .expect(({ body }) => {
          expect(body.document.failureReason).toBe('CONTENT_TYPE_NOT_ALLOWED');
          expect(body.document.failureKind).toBe('VERIFICATION');
        });
    });

    it('fails the document for a mismatched stored type with CONTENT_TYPE_MISMATCH', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Mismatch Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        'plain text body',
        'text/plain',
      );

      await completeUpload(token, organizationId, documentId)
        .expect(200)
        .expect(({ body }) => {
          expect(body.document.failureReason).toBe('CONTENT_TYPE_MISMATCH');
          expect(body.document.failureKind).toBe('VERIFICATION');
        });
    });

    it('fails the document for bytes that do not match the signed type with SIGNATURE_MISMATCH', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Signature Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        'not actually a pdf',
      );

      const response = await completeUpload(token, organizationId, documentId)
        .expect(200);

      expect(response.body.document.failureReason).toBe('SIGNATURE_MISMATCH');
      expect(response.body.document.failureKind).toBe('VERIFICATION');
      expect(JSON.stringify(response.body)).not.toContain('organizations/');
    });

    it('rejects with 409 when a newer upload URL superseded the staged one', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Superseded Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );
      await createUploadUrl(token, organizationId, documentId, {
        contentType: 'application/pdf',
      }).expect(200);

      await completeUpload(token, organizationId, documentId).expect(409);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('lets one of two concurrent completions win and leaves the document PROCESSING', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Concurrent Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      const responses = await Promise.all([
        completeUpload(token, organizationId, documentId),
        completeUpload(token, organizationId, documentId),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const document = await loadDocument(documentId);
      expect(document.status).toBe('PROCESSING');
      expect(document.generation).toBe(1);
      expect(await loadJobs(documentId)).toHaveLength(1);
    });

    it('rolls back the transition and generation when the job insert fails', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Rollback Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      await prisma.documentProcessingJob.create({
        data: {
          documentId,
          organizationId,
          documentGeneration: 0,
          verifiedStorageKey: 'organizations/pre-existing/verified',
          state: 'QUEUED',
          attempt: 0,
          maxAttempts: PROCESSING_MAX_ATTEMPTS,
        },
      });

      await completeUpload(token, organizationId, documentId).expect(500);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.generation).toBe(0);
      expect(document.storageKey).toBeNull();

      const jobs = await loadJobs(documentId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].verifiedStorageKey).toBe(
        'organizations/pre-existing/verified',
      );
    });

    it('short-circuits a repeat completion after PROCESSING without touching storage', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Idempotent Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );
      await completeUpload(token, organizationId, documentId).expect(200);
      const first = await loadDocument(documentId);

      storage.onInspectObject = () => {
        throw new Error('completion must not inspect a PROCESSING document');
      };
      storage.onReadObjectPrefix = () => {
        throw new Error('completion must not read a PROCESSING document');
      };
      storage.onCopyObject = () => {
        throw new Error('completion must not copy for a PROCESSING document');
      };

      const response = await completeUpload(token, organizationId, documentId)
        .expect(200);

      expect(response.body.document.status).toBe('PROCESSING');
      expect(response.body.document.updatedAt).toBe(
        first.updatedAt.toISOString(),
      );
      expect((await loadDocument(documentId)).generation).toBe(1);
      expect(await loadJobs(documentId)).toHaveLength(1);
    });

    it('retries a failed verification with a fresh upload and reaches PROCESSING', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Retry Complete Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        'not a pdf',
      );

      await completeUpload(token, organizationId, documentId).expect(200);
      const failed = await loadDocument(documentId);
      expect(failed.status).toBe('FAILED');
      expect(failed.generation).toBe(0);
      expect(await loadJobs(documentId)).toHaveLength(0);

      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      const response = await completeUpload(token, organizationId, documentId, {
        originalFileName: 'report.pdf',
      }).expect(200);

      expect(response.body.document.status).toBe('PROCESSING');
      expect(response.body.document.originalFileName).toBe('report.pdf');
      expect(response.body.document.failureReason).toBeNull();
      expect(response.body.document.failureKind).toBeNull();

      const document = await loadDocument(documentId);
      expect(document.generation).toBe(1);
      const jobs = await loadJobs(documentId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].documentGeneration).toBe(1);
    });

    it('maps a transient storage failure to 503 without changing state', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Transient Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );
      storage.inspectObject = async () => {
        throw new Error('storage exploded');
      };

      await completeUpload(token, organizationId, documentId).expect(503);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('does not transition when the promoted destination fails its integrity check', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Promotion Check Org',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );
      storage.inspectObject = async (key) =>
        key.includes('/verified/') ? null : originalInspectObject(key);

      await completeUpload(token, organizationId, documentId).expect(503);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('returns 403 for a non-member and writes nothing', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const organizationId = await createOrganization(
        owner.token,
        'Complete Guard Org',
      );
      const created = await createDocument(owner.token, organizationId, {
        title: 'Report',
      }).expect(201);
      const documentId = created.body.document.id as string;
      await uploadUrlAndObject(
        owner.token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      await completeUpload(
        outsider.token,
        organizationId,
        documentId,
      ).expect(403);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('returns 404 for a document in another organization and leaves it untouched', async () => {
      const ownerA = await registerUser();
      const ownerB = await registerUser();
      const organizationA = await createOrganization(ownerA.token, 'Complete A');
      const organizationB = await createOrganization(ownerB.token, 'Complete B');
      const created = await createDocument(ownerA.token, organizationA, {
        title: 'Secret',
      }).expect(201);
      const documentId = created.body.document.id as string;
      await uploadUrlAndObject(
        ownerA.token,
        organizationA,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      await completeUpload(
        ownerB.token,
        organizationB,
        documentId,
      ).expect(404);

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });

    it('returns 404 for a document that does not exist', async () => {
      const { token, organizationId } = await setupDocument('Missing Complete');

      await completeUpload(token, organizationId, randomUUID()).expect(404);
    });

    it('rejects malformed organization and document ids with 400', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Malformed Complete',
      );

      await completeUpload(token, 'not-a-uuid', documentId).expect(400);
      await completeUpload(token, organizationId, 'not-a-uuid').expect(400);
    });

    it('rejects invalid and unexpected body fields with 400 and writes nothing', async () => {
      const { token, organizationId, documentId } = await setupDocument(
        'Invalid Complete',
      );
      await uploadUrlAndObject(
        token,
        organizationId,
        documentId,
        'application/pdf',
        pdfBytes,
      );

      const invalidBodies: object[] = [
        { originalFileName: '' },
        { originalFileName: '   ' },
        { originalFileName: 'a'.repeat(256) },
        { originalFileName: 'report\u0000.pdf' },
        { originalFileName: 123 },
        { sizeBytes: 1024 },
        { contentType: 'application/pdf' },
        { status: 'PROCESSING' },
        { storageKey: 'organizations/org-1/documents/doc-1/verified/x' },
        { uploadStorageKey: 'organizations/org-1/documents/doc-1/x' },
      ];

      for (const body of invalidBodies) {
        await completeUpload(token, organizationId, documentId, body).expect(
          400,
        );
      }

      const document = await loadDocument(documentId);
      expect(document.status).toBe('PENDING');
      expect(document.storageKey).toBeNull();
    });
  });
});
