import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import {
  ProcessingJobService,
  type ClaimedProcessingJob,
} from '../src/processing/processing-job.service.js';
import { ProcessingWorkerService } from '../src/processing/processing-worker.service.js';
import { OBJECT_STORAGE } from '../src/storage/object-storage.port.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeObjectStorage } from './support/fake-object-storage.js';

const encoder = new TextEncoder();

interface SeedOptions {
  contentType?: string;
  bytes?: Uint8Array;
}

function ownershipOf(job: ClaimedProcessingJob) {
  return {
    jobId: job.id,
    leaseId: job.leaseId,
    organizationId: job.organizationId,
    documentGeneration: job.documentGeneration,
    verifiedStorageKey: job.verifiedStorageKey,
  };
}

describe('document processing worker (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jobs: ProcessingJobService;
  let worker: ProcessingWorkerService;
  let storage: FakeObjectStorage;
  const trackedOrganizationIds = new Set<string>();

  const seedJob = async (options: SeedOptions = {}) => {
    const contentType = options.contentType ?? 'text/plain';
    const bytes = options.bytes ?? encoder.encode('Hello worker');

    const organization = await prisma.organization.create({
      data: { name: `Worker ${randomUUID()}` },
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
        contentType,
        sizeBytes: bytes.byteLength,
      },
    });

    const job = await prisma.documentProcessingJob.create({
      data: {
        documentId: document.id,
        organizationId: organization.id,
        documentGeneration: 1,
        verifiedStorageKey,
        state: 'QUEUED',
        attempt: 0,
        maxAttempts: PROCESSING_MAX_ATTEMPTS,
        nextAttemptAt: new Date(Date.now() - 1_000),
      },
    });

    storage.putObject(verifiedStorageKey, bytes, contentType);

    return { organization, document, job, verifiedStorageKey, bytes };
  };

  const loadJob = (jobId: string) =>
    prisma.documentProcessingJob.findUniqueOrThrow({ where: { id: jobId } });

  const loadExtractions = (documentId: string) =>
    prisma.documentExtraction.findMany({ where: { documentId } });

  const expireLease = (jobId: string) =>
    prisma.documentProcessingJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });

  beforeAll(async () => {
    storage = new FakeObjectStorage();
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();

    prisma = moduleRef.get(PrismaService);
    jobs = moduleRef.get(ProcessingJobService);
    worker = moduleRef.get(ProcessingWorkerService);
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

  it('extracts a claimed job and completes it in one pass', async () => {
    const { document, job, bytes } = await seedJob();

    await expect(worker.runOnce()).resolves.toBe(true);

    const extractions = await loadExtractions(document.id);
    expect(extractions).toHaveLength(1);
    expect(extractions[0]?.content).toBe('Hello worker');
    expect(extractions[0]?.characterCount).toBe(bytes.byteLength);
    expect(extractions[0]?.documentGeneration).toBe(1);
    expect(extractions[0]?.verifiedStorageKey).toBe(job.verifiedStorageKey);

    const row = await loadJob(job.id);
    expect(row.state).toBe('SUCCEEDED');
    expect(row.leaseId).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();
    expect(row.claimedBy).toBeNull();
    expect(row.finishedAt).not.toBeNull();
  });

  it('never lets a stale execution publish over a newer lease', async () => {
    const { document, job } = await seedJob();

    const first = await jobs.claimNextDueJob('worker-a');
    expect(first?.id).toBe(job.id);

    await expireLease(job.id);
    await jobs.recoverExpiredLeases();

    const second = await jobs.claimNextDueJob('worker-b');
    expect(second?.id).toBe(job.id);
    expect(second?.leaseId).not.toBe(first?.leaseId);

    expect(
      await jobs.publishExtraction(ownershipOf(first!), {
        content: 'stale result',
        characterCount: 12,
      }),
    ).toBe(false);

    await worker.processJob(second!);

    const extractions = await loadExtractions(document.id);
    expect(extractions).toHaveLength(1);
    expect(extractions[0]?.content).toBe('Hello worker');

    const row = await loadJob(job.id);
    expect(row.state).toBe('SUCCEEDED');
  });

  it('refuses to publish a result that no longer matches a live lease', async () => {
    const { document, job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');

    await expireLease(job.id);

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('CLAIMED');
  });

  it('rejects a publish whose generation, storage key or tenant does not match', async () => {
    const { document, job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    const ownership = ownershipOf(claimed!);
    const result = { content: 'result', characterCount: 6 };

    expect(
      await jobs.publishExtraction(
        { ...ownership, documentGeneration: ownership.documentGeneration + 1 },
        result,
      ),
    ).toBe(false);
    expect(
      await jobs.publishExtraction(
        { ...ownership, verifiedStorageKey: `${ownership.verifiedStorageKey}x` },
        result,
      ),
    ).toBe(false);
    expect(
      await jobs.publishExtraction(
        { ...ownership, organizationId: randomUUID() },
        result,
      ),
    ).toBe(false);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('CLAIMED');

    expect(await jobs.publishExtraction(ownership, result)).toBe(true);
    expect(await loadExtractions(document.id)).toHaveLength(1);
  });

  it('renews a live lease and refuses to revive an expired one', async () => {
    const { job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    const before = await loadJob(job.id);

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(
      await jobs.renewLease({ jobId: job.id, leaseId: claimed!.leaseId }),
    ).toBe(true);

    const renewed = await loadJob(job.id);
    expect(renewed.leaseExpiresAt!.getTime()).toBeGreaterThan(
      before.leaseExpiresAt!.getTime(),
    );

    expect(
      await jobs.renewLease({ jobId: job.id, leaseId: randomUUID() }),
    ).toBe(false);

    await expireLease(job.id);
    expect(
      await jobs.renewLease({ jobId: job.id, leaseId: claimed!.leaseId }),
    ).toBe(false);
    expect((await loadJob(job.id)).leaseExpiresAt!.getTime()).toBeLessThan(
      Date.now(),
    );
  });

  it('leaves the job for recovery when the verified object is missing', async () => {
    const { document, job, verifiedStorageKey } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    storage.removeObject(verifiedStorageKey);

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('CLAIMED');
  });

  it('does not publish a document whose content type cannot be extracted', async () => {
    const { document, job } = await seedJob({
      contentType: 'application/octet-stream',
      bytes: encoder.encode('binary'),
    });
    const claimed = await jobs.claimNextDueJob('worker-a');

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('CLAIMED');
  });
});
