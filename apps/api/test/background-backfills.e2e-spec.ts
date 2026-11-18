import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { EMBEDDING_PROVIDER } from '../src/embeddings/embedding-provider.port.js';
import { FactsBackfillService } from '../src/facts/facts-backfill.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../src/storage/object-storage.port.js';
import { SummariesService } from '../src/summaries/summaries.service.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';
import {
  FakeEmbeddingProvider,
  deterministicVector,
} from './support/fake-embedding-provider.js';
import { FakeObjectStorage } from './support/fake-object-storage.js';

describe('background backfills under the tenant guard (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let summaries: SummariesService;
  let facts: FactsBackfillService;
  const organizationIds: string[] = [];

  const seedReadyDocument = async (withChunk: boolean) => {
    const organization = await prisma.organization.create({
      data: { name: `Backfill ${randomUUID()}` },
    });
    organizationIds.push(organization.id);
    const document = await prisma.document.create({
      data: {
        organizationId: organization.id,
        title: 'Contract',
        status: 'READY',
        generation: 1,
      },
    });

    if (withChunk) {
      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk"
          ("id", "documentId", "organizationId", "documentGeneration",
           "pageNumber", "chunkIndex", "content", "characterCount",
           "embedding", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(), ${document.id}::uuid, ${organization.id}::uuid, 1,
          1, 0, 'The contract renews every year.', 31,
          ${`[${deterministicVector(1).join(',')}]`}::vector, now(), now()
        )
      `;
    }

    return document;
  };

  const drain = async (runOnce: () => Promise<number>) => {
    for (let batch = 0; batch < 50; batch += 1) {
      if ((await runOnce()) === 0) return;
    }
    throw new Error('Backfill did not drain');
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARIZER)
      .useValue({
        summarize: async () => ({ summary: 'Renewal terms', keyTopics: [] }),
      })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(new FakeObjectStorage())
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(new FakeEmbeddingProvider())
      .compile();

    prisma = moduleRef.get(PrismaService);
    summaries = moduleRef.get(SummariesService);
    facts = moduleRef.get(FactsBackfillService);
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds.splice(0) } },
    });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('summarizes pending documents across organizations', async () => {
    const first = await seedReadyDocument(true);
    const second = await seedReadyDocument(true);

    await drain(() => summaries.runOnce());

    for (const document of [first, second]) {
      const stored = await prisma.document.findFirstOrThrow({
        where: { id: document.id, organizationId: document.organizationId },
        include: { summaries: true },
      });
      expect(stored.summaryStatus).toBe('READY');
      expect(stored.summaries.map((summary) => summary.summary)).toEqual([
        'Renewal terms',
      ]);
    }
  });

  it('settles pending facts across organizations', async () => {
    const first = await seedReadyDocument(false);
    const second = await seedReadyDocument(false);

    await drain(() => facts.runOnce());

    for (const document of [first, second]) {
      const stored = await prisma.document.findFirstOrThrow({
        where: { id: document.id, organizationId: document.organizationId },
      });
      expect(stored.factsStatus).toBe('FAILED');
      expect(stored.factsFailureReason).toBe('MissingExtraction');
    }
  });
});
