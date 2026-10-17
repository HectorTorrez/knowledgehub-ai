import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../src/embeddings/embedding-provider.port.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RetrievalService } from '../src/retrieval/retrieval.service.js';

function basis(index: number): number[] {
  return Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, position) =>
    position === index ? 1 : 0,
  );
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

interface SeedChunk {
  documentId: string;
  organizationId: string;
  documentGeneration: number;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

describe('document retrieval (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let retrieval: RetrievalService;
  let embedImpl: EmbeddingProvider['embed'];
  const trackedOrganizationIds = new Set<string>();

  const embeddings: EmbeddingProvider = {
    embed: (texts) => embedImpl(texts),
  };

  const seedOrganization = async (): Promise<string> => {
    const organization = await prisma.organization.create({
      data: { name: `Retrieval ${randomUUID()}` },
    });
    trackedOrganizationIds.add(organization.id);
    return organization.id;
  };

  const seedDocument = async (
    organizationId: string,
    options: {
      status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
      generation?: number;
      title?: string;
    } = {},
  ): Promise<string> => {
    const document = await prisma.document.create({
      data: {
        organizationId,
        title: options.title ?? 'Report',
        status: options.status ?? 'READY',
        generation: options.generation ?? 1,
        storageKey: `organizations/${organizationId}/documents/${randomUUID()}/verified/${randomUUID()}`,
        contentType: 'text/plain',
        sizeBytes: 10,
      },
    });
    return document.id;
  };

  const seedChunk = async (chunk: SeedChunk): Promise<void> => {
    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${chunk.documentId}::uuid,
        ${chunk.organizationId}::uuid,
        ${chunk.documentGeneration},
        ${chunk.pageNumber},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${chunk.content.length},
        ${vectorLiteral(chunk.embedding)}::vector,
        now(),
        now()
      )
    `;
  };

  beforeAll(async () => {
    embedImpl = async () => [basis(0)];
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(embeddings)
      .compile();

    prisma = moduleRef.get(PrismaService);
    retrieval = moduleRef.get(RetrievalService);
  });

  afterEach(async () => {
    embedImpl = async () => [basis(0)];
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

  it('returns the most similar chunks with their document context', async () => {
    const organizationId = await seedOrganization();
    const documentId = await seedDocument(organizationId, {
      title: 'Quarterly report',
    });

    await seedChunk({
      documentId,
      organizationId,
      documentGeneration: 1,
      pageNumber: 4,
      chunkIndex: 1,
      content: 'the closest passage',
      embedding: basis(0),
    });
    await seedChunk({
      documentId,
      organizationId,
      documentGeneration: 1,
      pageNumber: 9,
      chunkIndex: 2,
      content: 'an unrelated passage',
      embedding: basis(1),
    });

    const results = await retrieval.search({ organizationId, text: 'anything' });

    expect(results.map((result) => result.content)).toEqual([
      'the closest passage',
      'an unrelated passage',
    ]);
    expect(results[0]).toMatchObject({
      documentId,
      title: 'Quarterly report',
      pageNumber: 4,
      chunkIndex: 1,
      content: 'the closest passage',
    });
    expect(results[0]!.similarity).toBeCloseTo(1, 5);
    expect(results[0]!.chunkId).toBeTypeOf('string');
    expect(results[1]!.similarity).toBeCloseTo(0, 5);
  });

  it('never returns another organization\u2019s chunks', async () => {
    const mine = await seedOrganization();
    const theirs = await seedOrganization();
    const myDocument = await seedDocument(mine);
    const theirDocument = await seedDocument(theirs);

    await seedChunk({
      documentId: theirDocument,
      organizationId: theirs,
      documentGeneration: 1,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'their secret passage',
      embedding: basis(0),
    });
    await seedChunk({
      documentId: myDocument,
      organizationId: mine,
      documentGeneration: 1,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'my passage',
      embedding: basis(0),
    });

    const results = await retrieval.search({ organizationId: mine, text: 'anything' });

    expect(results.map((result) => result.content)).toEqual(['my passage']);
    expect(results.every((result) => result.documentId === myDocument)).toBe(true);
  });

  it('never returns an obsolete generation', async () => {
    const organizationId = await seedOrganization();
    const documentId = await seedDocument(organizationId, { generation: 2 });

    await seedChunk({
      documentId,
      organizationId,
      documentGeneration: 1,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'obsolete passage',
      embedding: basis(0),
    });
    await seedChunk({
      documentId,
      organizationId,
      documentGeneration: 2,
      pageNumber: 1,
      chunkIndex: 0,
      content: 'current passage',
      embedding: basis(1),
    });

    const results = await retrieval.search({ organizationId, text: 'anything' });

    expect(results.map((result) => result.content)).toEqual(['current passage']);
  });

  it('never returns documents that are not READY', async () => {
    const organizationId = await seedOrganization();
    const ready = await seedDocument(organizationId, { status: 'READY' });
    const pending = await seedDocument(organizationId, { status: 'PENDING' });
    const processing = await seedDocument(organizationId, { status: 'PROCESSING' });
    const failed = await seedDocument(organizationId, { status: 'FAILED' });

    for (const [documentId, content] of [
      [ready, 'ready passage'],
      [pending, 'pending passage'],
      [processing, 'processing passage'],
      [failed, 'failed passage'],
    ] as const) {
      await seedChunk({
        documentId,
        organizationId,
        documentGeneration: 1,
        pageNumber: 1,
        chunkIndex: 0,
        content,
        embedding: basis(0),
      });
    }

    const results = await retrieval.search({ organizationId, text: 'anything' });

    expect(results.map((result) => result.content)).toEqual(['ready passage']);
  });

  it('honours the requested limit', async () => {
    const organizationId = await seedOrganization();
    const documentId = await seedDocument(organizationId);

    for (let index = 0; index < 3; index += 1) {
      await seedChunk({
        documentId,
        organizationId,
        documentGeneration: 1,
        pageNumber: 1,
        chunkIndex: index,
        content: `passage ${index}`,
        embedding: basis(index),
      });
    }

    const results = await retrieval.search({
      organizationId,
      text: 'anything',
      limit: 2,
    });

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.content)).toEqual([
      'passage 0',
      'passage 1',
    ]);
  });
});
