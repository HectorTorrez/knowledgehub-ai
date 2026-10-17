import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const VECTOR_LITERAL = `[${Array.from({ length: 1536 }, () => '0').join(',')}]`;

describe('DocumentChunk embedding constraints (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const trackedOrganizationIds = new Set<string>();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
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
    await moduleRef.close();
  });

  const seedDocument = async () => {
    const organization = await prisma.organization.create({
      data: { name: `Embedding ${randomUUID()}` },
    });
    trackedOrganizationIds.add(organization.id);

    const document = await prisma.document.create({
      data: {
        organizationId: organization.id,
        title: 'Report',
        status: 'PROCESSING',
        generation: 1,
        storageKey: `organizations/${organization.id}/documents/${randomUUID()}/verified/${randomUUID()}`,
        contentType: 'text/plain',
        sizeBytes: 10,
      },
    });

    return { organization, document };
  };

  const insertChunk = (
    documentId: string,
    organizationId: string,
    embedding: string | null,
    chunkIndex = 0,
  ) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentChunk"
         ("id", "documentId", "organizationId", "documentGeneration", "pageNumber",
          "chunkIndex", "content", "characterCount", "embedding", "updatedAt")
       VALUES ($1, $2, $3, 1, 1, $4, 'chunk', 5, $5::vector, now())`,
      randomUUID(),
      documentId,
      organizationId,
      chunkIndex,
      embedding,
    );

  it('stores a valid 1536-dimension embedding', async () => {
    const { organization, document } = await seedDocument();

    await expect(
      insertChunk(document.id, organization.id, VECTOR_LITERAL),
    ).resolves.toBe(1);

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: document.id },
    });
    expect(chunks).toHaveLength(1);
  });

  it('rejects a vector of the wrong dimension', async () => {
    const { organization, document } = await seedDocument();

    await expect(
      insertChunk(document.id, organization.id, '[0,0,0]'),
    ).rejects.toThrow();
  });

  it('rejects a missing embedding', async () => {
    const { organization, document } = await seedDocument();

    await expect(
      insertChunk(document.id, organization.id, null),
    ).rejects.toThrow();
  });

  it('rejects a value that is not a vector', async () => {
    const { organization, document } = await seedDocument();

    await expect(
      insertChunk(document.id, organization.id, 'not-a-vector'),
    ).rejects.toThrow();
  });

  it('leaves the document generation and processing state untouched on rejection', async () => {
    const { organization, document } = await seedDocument();

    await expect(
      insertChunk(document.id, organization.id, '[0,0,0]'),
    ).rejects.toThrow();
    await expect(
      insertChunk(document.id, organization.id, null),
    ).rejects.toThrow();

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(unchanged.status).toBe('PROCESSING');
    expect(unchanged.generation).toBe(1);
    expect(unchanged.failureReason).toBeNull();
    expect(unchanged.failureKind).toBeNull();
    expect(
      await prisma.documentChunk.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });
});
