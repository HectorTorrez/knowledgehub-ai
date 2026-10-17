import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import {
  EMBEDDING_PROVIDER,
  EmbeddingUnavailableError,
  type EmbeddingProvider,
} from '../src/embeddings/embedding-provider.port.js';
import type { DocumentChunkDraft } from '../src/processing/chunking.policy.js';
import { DocumentChunkStore } from '../src/processing/document-chunk.store.js';
import type { ProcessingOwnership } from '../src/processing/processing-job.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CHUNKS: DocumentChunkDraft[] = [
  { pageNumber: 1, chunkIndex: 0, content: 'alpha', characterCount: 5 },
  { pageNumber: 2, chunkIndex: 1, content: 'beta', characterCount: 4 },
];

function vectorOf(seed: number): number[] {
  return Array.from(
    { length: EMBEDDING_VECTOR_DIMENSIONS },
    (_, index) => (seed + 1) / (index + 1),
  );
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

interface StoredChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  characterCount: number;
  organizationId: string;
  documentGeneration: number;
  matchesFirst: boolean;
  matchesSecond: boolean;
}

describe('document chunk embeddings (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let store: DocumentChunkStore;
  let embedImpl: EmbeddingProvider['embed'];
  const trackedOrganizationIds = new Set<string>();

  const embeddings: EmbeddingProvider = {
    embed: (texts) => embedImpl(texts),
  };

  const seedClaimedJob = async () => {
    const organization = await prisma.organization.create({
      data: { name: `Chunks ${randomUUID()}` },
    });
    trackedOrganizationIds.add(organization.id);

    const verifiedStorageKey = `organizations/${organization.id}/documents/${randomUUID()}/verified/${randomUUID()}`;
    const document = await prisma.document.create({
      data: {
        organizationId: organization.id,
        title: 'Report',
        status: 'PROCESSING',
        generation: 1,
        storageKey: verifiedStorageKey,
        contentType: 'text/plain',
        sizeBytes: 10,
      },
    });

    const leaseId = randomUUID();
    const job = await prisma.documentProcessingJob.create({
      data: {
        documentId: document.id,
        organizationId: organization.id,
        documentGeneration: 1,
        verifiedStorageKey,
        state: 'CLAIMED',
        attempt: 1,
        maxAttempts: PROCESSING_MAX_ATTEMPTS,
        nextAttemptAt: new Date(Date.now() - 1_000),
        leaseId,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        claimedBy: 'embedding-test',
      },
    });

    const ownership: ProcessingOwnership = {
      jobId: job.id,
      leaseId,
      organizationId: organization.id,
      documentGeneration: 1,
      verifiedStorageKey,
    };

    return { organization, document, job, ownership };
  };

  const loadChunks = (documentId: string, first: number[], second: number[]) =>
    prisma.$queryRaw<StoredChunk[]>`
      SELECT "chunkIndex", "pageNumber", content, "characterCount",
             "organizationId", "documentGeneration",
             ("embedding" = ${vectorLiteral(first)}::vector) AS "matchesFirst",
             ("embedding" = ${vectorLiteral(second)}::vector) AS "matchesSecond"
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId}::uuid
      ORDER BY "chunkIndex"
    `;

  beforeAll(async () => {
    embedImpl = async (texts) => texts.map((_, index) => vectorOf(index + 1));
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(embeddings)
      .compile();

    prisma = moduleRef.get(PrismaService);
    store = moduleRef.get(DocumentChunkStore);
  });

  afterEach(async () => {
    embedImpl = async (texts) => texts.map((_, index) => vectorOf(index + 1));
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

  it('stores one vector per chunk and leaves the job and document processing', async () => {
    const first = vectorOf(1);
    const second = vectorOf(2);
    const { document, job, ownership } = await seedClaimedJob();

    await expect(store.replaceForGeneration(ownership, CHUNKS)).resolves.toBe(true);

    const chunks = await loadChunks(document.id, first, second);
    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        pageNumber: 1,
        content: 'alpha',
        characterCount: 5,
        organizationId: ownership.organizationId,
        documentGeneration: 1,
        matchesFirst: true,
        matchesSecond: false,
      },
      {
        chunkIndex: 1,
        pageNumber: 2,
        content: 'beta',
        characterCount: 4,
        organizationId: ownership.organizationId,
        documentGeneration: 1,
        matchesFirst: false,
        matchesSecond: true,
      },
    ]);

    const storedJob = await prisma.documentProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(storedJob.state).toBe('CLAIMED');
    expect(storedJob.leaseId).toBe(ownership.leaseId);

    const storedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(storedDocument.status).toBe('PROCESSING');
    expect(storedDocument.generation).toBe(1);
    expect(storedDocument.failureReason).toBeNull();
  });

  it('replaces the generation on retry instead of appending vectors', async () => {
    const { document, ownership } = await seedClaimedJob();
    await store.replaceForGeneration(ownership, CHUNKS);

    const replaced = vectorOf(9);
    embedImpl = async () => [replaced, replaced];
    await expect(store.replaceForGeneration(ownership, CHUNKS)).resolves.toBe(true);

    const chunks = await loadChunks(document.id, vectorOf(1), replaced);
    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.matchesSecond && !chunk.matchesFirst)).toBe(
      true,
    );
  });

  it('keeps previously stored vectors when the provider fails', async () => {
    const first = vectorOf(1);
    const second = vectorOf(2);
    const { document, ownership } = await seedClaimedJob();
    await store.replaceForGeneration(ownership, CHUNKS);

    embedImpl = async () => {
      throw new EmbeddingUnavailableError('The embedding provider is unavailable');
    };

    await expect(store.replaceForGeneration(ownership, CHUNKS)).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );

    const chunks = await loadChunks(document.id, first, second);
    expect(chunks.map((chunk) => chunk.matchesFirst)).toEqual([true, false]);
    expect(chunks.map((chunk) => chunk.matchesSecond)).toEqual([false, true]);
  });

  it('does not write or delete when the lease no longer matches', async () => {
    const first = vectorOf(1);
    const second = vectorOf(2);
    const { document, job, ownership } = await seedClaimedJob();
    await store.replaceForGeneration(ownership, CHUNKS);

    await prisma.documentProcessingJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    embedImpl = async () => {
      throw new Error('stale ownership must not embed');
    };

    await expect(store.replaceForGeneration(ownership, CHUNKS)).resolves.toBe(false);

    const chunks = await loadChunks(document.id, first, second);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.matchesFirst).toBe(true);
  });

  it('does not write when the document generation or status no longer matches', async () => {
    const { document, ownership } = await seedClaimedJob();

    await prisma.document.update({
      where: { id: document.id },
      data: { generation: 2 },
    });
    await expect(store.replaceForGeneration(ownership, CHUNKS)).resolves.toBe(false);

    await prisma.document.update({
      where: { id: document.id },
      data: { generation: 1, status: 'READY' },
    });
    await expect(store.replaceForGeneration(ownership, CHUNKS)).resolves.toBe(false);

    expect(
      await prisma.documentChunk.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });

  it('leaves other generations and other documents untouched', async () => {
    const { document, ownership } = await seedClaimedJob();
    const other = await seedClaimedJob();
    const preserved = vectorOf(7);

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${document.id}::uuid,
        ${ownership.organizationId}::uuid,
        2,
        1,
        0,
        'older generation',
        16,
        ${vectorLiteral(preserved)}::vector,
        now()
      )
    `;
    await store.replaceForGeneration(other.ownership, CHUNKS);
    await store.replaceForGeneration(ownership, [
      CHUNKS[0]!,
    ]);

    const older = await prisma.$queryRaw<{ matches: boolean }[]>`
      SELECT ("embedding" = ${vectorLiteral(preserved)}::vector) AS matches
      FROM "DocumentChunk"
      WHERE "documentId" = ${document.id}::uuid
        AND "documentGeneration" = 2
    `;
    expect(older).toEqual([{ matches: true }]);
    expect(
      await prisma.documentChunk.count({ where: { documentId: other.document.id } }),
    ).toBe(2);
    expect(
      await prisma.documentChunk.count({
        where: { documentId: document.id, documentGeneration: 1 },
      }),
    ).toBe(1);
  });
});
