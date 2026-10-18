import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../src/embeddings/embedding-provider.port.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct horse battery staple';

function basis(index: number): number[] {
  return Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, position) =>
    position === index ? 1 : 0,
  );
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function validBody() {
  return {
    email: `search-${randomUUID()}@example.test`,
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

describe('search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let embedImpl: EmbeddingProvider['embed'];
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();

  const embeddings: EmbeddingProvider = {
    embed: (texts) => embedImpl(texts),
  };

  const registerUser = async (): Promise<{ token: string }> => {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return { token: cookieValue(setCookies(response), ACCESS_TOKEN_COOKIE) };
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

  const seedReadyChunk = async (
    organizationId: string,
    content: string,
    title = 'Handbook',
  ): Promise<void> => {
    const document = await prisma.document.create({
      data: {
        organizationId,
        title,
        status: 'READY',
        generation: 1,
        storageKey: `organizations/${organizationId}/documents/${randomUUID()}/verified/${randomUUID()}`,
        contentType: 'text/plain',
        sizeBytes: content.length,
      },
    });

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${document.id}::uuid,
        ${organizationId}::uuid,
        1,
        2,
        4,
        ${content},
        ${content.length},
        ${vectorLiteral(basis(0))}::vector,
        now(),
        now()
      )
    `;
  };

  const search = (token: string, organizationId: string, q: string) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}/search`)
      .query({ q })
      .set(bearer(token));

  beforeAll(async () => {
    embedImpl = async () => [basis(0)];

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(embeddings)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    if (trackedOrganizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...trackedOrganizationIds] } },
      });
      trackedOrganizationIds.clear();
    }
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('returns ranked passages matching the query', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Search Org');
    await seedReadyChunk(
      organizationId,
      'The parental leave policy is generous.',
      'Employee Handbook',
    );

    const response = await search(token, organizationId, 'parental leave').expect(
      200,
    );

    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      documentTitle: 'Employee Handbook',
      pageNumber: 2,
      chunkIndex: 4,
      excerpt: 'The parental leave policy is generous.',
    });
    expect(response.body.results[0].score).toBeGreaterThan(0);
  });

  it('returns an empty result set when nothing matches', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Empty Search Org');

    const response = await search(token, organizationId, 'nothing here').expect(
      200,
    );

    expect(response.body).toEqual({ results: [] });
  });

  it('rejects a blank query with 400', async () => {
    const { token } = await registerUser();
    const organizationId = await createOrganization(token, 'Blank Search Org');

    await search(token, organizationId, '   ').expect(400);
  });

  it('rejects a non-member with 403', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const organizationId = await createOrganization(owner.token, 'Scoped Search');

    await search(outsider.token, organizationId, 'parental leave').expect(403);
  });
});
