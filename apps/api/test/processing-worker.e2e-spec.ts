import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import {
  ProcessingJobService,
  type ClaimedProcessingJob,
  type ProcessingOwnership,
} from '../src/processing/processing-job.service.js';
import { ProcessingWorkerService } from '../src/processing/processing-worker.service.js';
import { OBJECT_STORAGE } from '../src/storage/object-storage.port.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeObjectStorage } from './support/fake-object-storage.js';

const encoder = new TextEncoder();

interface SeedOptions {
  contentType?: string;
  bytes?: Uint8Array;
  attempt?: number;
  claimed?: boolean;
}

function ownershipOf(job: ClaimedProcessingJob): ProcessingOwnership {
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

    const claimed = options.claimed ?? false;
    const job = await prisma.documentProcessingJob.create({
      data: {
        documentId: document.id,
        organizationId: organization.id,
        documentGeneration: 1,
        verifiedStorageKey,
        state: claimed ? 'CLAIMED' : 'QUEUED',
        attempt: options.attempt ?? 0,
        maxAttempts: PROCESSING_MAX_ATTEMPTS,
        nextAttemptAt: new Date(Date.now() - 1_000),
        leaseId: claimed ? randomUUID() : null,
        leaseExpiresAt: claimed
          ? new Date(Date.now() + 60_000)
          : null,
        claimedBy: claimed ? 'seeded-worker' : null,
      },
    });

    storage.putObject(verifiedStorageKey, bytes, contentType);

    return { organization, document, job, verifiedStorageKey, bytes };
  };

  const loadJob = (jobId: string) =>
    prisma.documentProcessingJob.findUniqueOrThrow({ where: { id: jobId } });

  const loadDocument = (documentId: string) =>
    prisma.document.findUniqueOrThrow({ where: { id: documentId } });

  const loadExtractions = (documentId: string) =>
    prisma.documentExtraction.findMany({ where: { documentId } });

  const expireLease = (jobId: string) =>
    prisma.documentProcessingJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });

  const makeDue = (jobId: string) =>
    prisma.documentProcessingJob.update({
      where: { id: jobId },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
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
    storage.onInspectObject = null;
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

  it('extracts a claimed job, completes it, and readies the document', async () => {
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
    expect(row.finishedAt).not.toBeNull();

    const updatedDocument = await loadDocument(document.id);
    expect(updatedDocument.status).toBe('READY');
    expect(updatedDocument.failureReason).toBeNull();
    expect(updatedDocument.failureKind).toBeNull();
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

    expect((await loadJob(job.id)).state).toBe('SUCCEEDED');
    expect((await loadDocument(document.id)).status).toBe('READY');
  });

  it('refuses to publish a result that no longer matches a live lease', async () => {
    const { document, job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');

    await expireLease(job.id);

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('CLAIMED');
    expect((await loadDocument(document.id)).status).toBe('PROCESSING');
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
    expect((await loadDocument(document.id)).status).toBe('READY');
  });

  it('rolls back the extraction and job when finalization fails at the database', async () => {
    const { document, job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    const ownership = ownershipOf(claimed!);

    const triggerName = `fail_ready_${randomUUID().replace(/-/g, '')}`;

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${triggerName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'READY' THEN
          RAISE EXCEPTION 'forced finalization failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "Document"
      FOR EACH ROW EXECUTE FUNCTION "${triggerName}"();
    `);

    try {
      await expect(
        jobs.publishExtraction(ownership, {
          content: 'text',
          characterCount: 4,
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "Document"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${triggerName}"()`,
      );
    }

    expect(await loadExtractions(document.id)).toHaveLength(0);
    const uncompleted = await loadJob(job.id);
    expect(uncompleted.state).toBe('CLAIMED');
    expect((await loadDocument(document.id)).status).toBe('PROCESSING');
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

  it('fails permanently with a sanitized reason when the verified object is missing', async () => {
    const { document, job, verifiedStorageKey } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    storage.removeObject(verifiedStorageKey);

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);
    expect((await loadJob(job.id)).state).toBe('FAILED');

    const failed = await loadDocument(document.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.failureKind).toBe('PROCESSING');
    expect(failed.failureReason).toBe('VERIFIED_OBJECT_MISSING');
    expect(failed.failureReason).not.toContain(verifiedStorageKey);
  });

  it('fails permanently without retrying a document whose content type cannot be extracted', async () => {
    const { document, job } = await seedJob({
      contentType: 'application/octet-stream',
      bytes: encoder.encode('binary'),
    });
    const claimed = await jobs.claimNextDueJob('worker-a');

    await worker.processJob(claimed!);

    expect(await loadExtractions(document.id)).toHaveLength(0);

    const failedJob = await loadJob(job.id);
    expect(failedJob.state).toBe('FAILED');
    expect(failedJob.attempt).toBe(1);

    const failed = await loadDocument(document.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.failureKind).toBe('PROCESSING');
    expect(failed.failureReason).toBe('CONTENT_UNSUPPORTED');
  });

  it('schedules a retry with backoff on a transient failure and succeeds on the next attempt', async () => {
    const { document, job } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');

    storage.onInspectObject = () => {
      throw new Error('storage is temporarily unavailable');
    };

    await worker.processJob(claimed!);

    const requeued = await loadJob(job.id);
    expect(requeued.state).toBe('QUEUED');
    expect(requeued.leaseId).toBeNull();
    expect(requeued.attempt).toBe(1);
    expect(requeued.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 1_000);
    expect(requeued.nextAttemptAt.getTime()).toBeLessThan(Date.now() + 60_000);
    expect((await loadDocument(document.id)).status).toBe('PROCESSING');
    expect(await loadExtractions(document.id)).toHaveLength(0);

    storage.onInspectObject = null;
    await makeDue(job.id);

    const retried = await jobs.claimNextDueJob('worker-b');
    expect(retried?.attempt).toBe(2);

    await worker.processJob(retried!);

    expect((await loadJob(job.id)).state).toBe('SUCCEEDED');
    expect((await loadDocument(document.id)).status).toBe('READY');
    expect(await loadExtractions(document.id)).toHaveLength(1);
  });

  it('recovers an expired claim and fails the document when the retry budget is exhausted', async () => {
    const { document, job } = await seedJob({
      attempt: PROCESSING_MAX_ATTEMPTS,
      claimed: true,
    });
    await expireLease(job.id);

    await expect(jobs.recoverExpiredLeases()).resolves.toEqual({
      recovered: 0,
      failed: 1,
    });

    const failedJob = await loadJob(job.id);
    expect(failedJob.state).toBe('FAILED');
    expect(failedJob.finishedAt).not.toBeNull();

    const failed = await loadDocument(document.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.failureKind).toBe('PROCESSING');
    expect(failed.failureReason).toBe('PROCESSING_FAILED');
  });

  it('never lets a stale job change the status of a newer document generation', async () => {
    const { document } = await seedJob();
    const claimed = await jobs.claimNextDueJob('worker-a');
    const ownership = ownershipOf(claimed!);

    const newerKey = `organizations/${document.organizationId}/documents/${document.id}/verified/${randomUUID()}`;
    await prisma.document.update({
      where: { id: document.id },
      data: { generation: 2, storageKey: newerKey },
    });

    expect(
      await jobs.publishExtraction(ownership, {
        content: 'stale',
        characterCount: 5,
      }),
    ).toBe(false);
    await jobs.recordFailure(ownership, {
      category: 'permanent',
      reason: 'CONTENT_CORRUPT',
      detail: 'DocumentExtractionError',
    });

    const newer = await loadDocument(document.id);
    expect(newer.generation).toBe(2);
    expect(newer.status).toBe('PROCESSING');
    expect(newer.failureReason).toBeNull();
    expect(await loadExtractions(document.id)).toHaveLength(0);
  });

  it('is idempotent when the same terminal outcome is finalized twice', async () => {
    const { document, job } = await seedJob();

    await expect(worker.runOnce()).resolves.toBe(true);

    const succeeded = await loadJob(job.id);
    const ownership: ProcessingOwnership = {
      jobId: succeeded.id,
      leaseId: randomUUID(),
      organizationId: succeeded.organizationId,
      documentGeneration: succeeded.documentGeneration,
      verifiedStorageKey: succeeded.verifiedStorageKey,
    };

    expect(
      await jobs.publishExtraction(ownership, {
        content: 'again',
        characterCount: 5,
      }),
    ).toBe(false);
    expect(
      await jobs.recordFailure(ownership, {
        category: 'permanent',
        reason: 'CONTENT_CORRUPT',
        detail: 'DocumentExtractionError',
      }),
    ).toBe(false);

    expect(await loadExtractions(document.id)).toHaveLength(1);
    expect((await loadDocument(document.id)).status).toBe('READY');
  });
});
