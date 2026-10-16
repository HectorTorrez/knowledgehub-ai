import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import { LEASE_EXPIRED_ATTEMPTS_EXHAUSTED } from '../src/processing/processing-lease.policy.js';
import { ProcessingJobService } from '../src/processing/processing-job.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const WORKER = 'worker-1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SeedJobOptions {
  state?: 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED';
  attempt?: number;
  maxAttempts?: number;
  nextAttemptAt?: Date;
  leaseId?: string;
  leaseExpiresAt?: Date;
  claimedBy?: string;
  generation?: number;
}

describe('processing job claiming and leases (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: ProcessingJobService;
  const trackedOrganizationIds = new Set<string>();

  const seedJob = async (options: SeedJobOptions = {}) => {
    const organization = await prisma.organization.create({
      data: { name: `Processing ${randomUUID()}` },
    });
    trackedOrganizationIds.add(organization.id);

    const generation = options.generation ?? 1;
    const verifiedStorageKey = `organizations/${organization.id}/documents/${randomUUID()}/verified/${randomUUID()}`;

    const document = await prisma.document.create({
      data: {
        organizationId: organization.id,
        title: 'Report',
        status: 'PROCESSING',
        generation,
        storageKey: verifiedStorageKey,
        contentType: 'application/pdf',
        sizeBytes: 128,
      },
    });

    const job = await prisma.documentProcessingJob.create({
      data: {
        documentId: document.id,
        organizationId: organization.id,
        documentGeneration: generation,
        verifiedStorageKey,
        state: options.state ?? 'QUEUED',
        attempt: options.attempt ?? 0,
        maxAttempts: options.maxAttempts ?? PROCESSING_MAX_ATTEMPTS,
        nextAttemptAt: options.nextAttemptAt ?? new Date(Date.now() - 1_000),
        leaseId: options.leaseId,
        leaseExpiresAt: options.leaseExpiresAt,
        claimedBy: options.claimedBy,
      },
    });

    return { organization, document, job, verifiedStorageKey, generation };
  };

  const loadJob = (jobId: string) =>
    prisma.documentProcessingJob.findUniqueOrThrow({ where: { id: jobId } });

  const expireLease = (jobId: string) =>
    prisma.documentProcessingJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ProcessingJobService);
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

  it('claims a due queued job and assigns it to the worker', async () => {
    const { job, document, organization, verifiedStorageKey } = await seedJob();

    const claimed = await service.claimNextDueJob(WORKER);

    expect(claimed).not.toBeNull();
    expect(claimed).toMatchObject({
      id: job.id,
      documentId: document.id,
      organizationId: organization.id,
      documentGeneration: 1,
      verifiedStorageKey,
      attempt: 1,
      maxAttempts: PROCESSING_MAX_ATTEMPTS,
    });
    expect(claimed?.leaseId).toMatch(UUID_PATTERN);

    const row = await loadJob(job.id);
    expect(row.state).toBe('CLAIMED');
    expect(row.attempt).toBe(1);
    expect(row.claimedBy).toBe(WORKER);
    expect(row.leaseId).toBe(claimed?.leaseId);
  });

  it('does not claim a queued job that is not due yet', async () => {
    const { job } = await seedJob({
      nextAttemptAt: new Date(Date.now() + 60_000),
    });

    expect(await service.claimNextDueJob(WORKER)).toBeNull();

    const row = await loadJob(job.id);
    expect(row.state).toBe('QUEUED');
    expect(row.attempt).toBe(0);
    expect(row.leaseId).toBeNull();
    expect(row.claimedBy).toBeNull();
  });

  it('lets exactly one of many concurrent claimers own a job', async () => {
    const { job } = await seedJob();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        service.claimNextDueJob(`worker-${index}`),
      ),
    );

    const owned = results.filter((result) => result !== null);
    const ownerIndex = results.findIndex((result) => result !== null);
    expect(owned).toHaveLength(1);
    expect(owned[0]?.id).toBe(job.id);
    expect(owned[0]?.attempt).toBe(1);

    const row = await loadJob(job.id);
    expect(row.state).toBe('CLAIMED');
    expect(row.attempt).toBe(1);
    expect(row.claimedBy).toBe(`worker-${ownerIndex}`);
    expect(row.leaseId).toBe(owned[0]?.leaseId);
  });

  it('mints a fresh lease with a future expiry when claiming', async () => {
    const { job } = await seedJob();

    await service.claimNextDueJob(WORKER);
    const row = await loadJob(job.id);

    expect(row.leaseId).toMatch(UUID_PATTERN);
    expect(row.leaseExpiresAt).not.toBeNull();
    expect(row.leaseExpiresAt!.getTime()).toBeGreaterThan(
      row.updatedAt.getTime(),
    );
    expect(row.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: row.leaseId! }),
    ).toBe(true);
  });

  it('recovers an expired claim back to the queue for another worker', async () => {
    const { job } = await seedJob();
    await service.claimNextDueJob(WORKER);
    await expireLease(job.id);

    expect(await service.recoverExpiredLeases()).toEqual({
      recovered: 1,
      failed: 0,
    });

    const recoveredRow = await loadJob(job.id);
    expect(recoveredRow.state).toBe('QUEUED');
    expect(recoveredRow.leaseId).toBeNull();
    expect(recoveredRow.leaseExpiresAt).toBeNull();
    expect(recoveredRow.claimedBy).toBeNull();
    expect(recoveredRow.attempt).toBe(1);

    const reclaimed = await service.claimNextDueJob('worker-2');
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempt).toBe(2);
  });

  it('invalidates the previous lease when an expired claim is recovered', async () => {
    const { job } = await seedJob();
    const first = await service.claimNextDueJob(WORKER);
    expect(first).not.toBeNull();
    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: first!.leaseId }),
    ).toBe(true);

    await expireLease(job.id);
    await service.recoverExpiredLeases();

    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: first!.leaseId }),
    ).toBe(false);

    const second = await service.claimNextDueJob('worker-2');
    expect(second).not.toBeNull();
    expect(second!.leaseId).not.toBe(first!.leaseId);
    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: first!.leaseId }),
    ).toBe(false);
    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: second!.leaseId }),
    ).toBe(true);
  });

  it('rejects a stale lease at the ownership check', async () => {
    const { job, document, organization, verifiedStorageKey } = await seedJob();
    const stale = await service.claimNextDueJob(WORKER);
    expect(stale).not.toBeNull();

    const ownership = {
      jobId: job.id,
      leaseId: stale!.leaseId,
      organizationId: organization.id,
      documentGeneration: document.generation,
      verifiedStorageKey,
    };
    expect(await service.ownsProcessableDocument(ownership)).toBe(true);

    await expireLease(job.id);
    expect(
      await service.hasValidLease({ jobId: job.id, leaseId: stale!.leaseId }),
    ).toBe(false);
    expect(await service.ownsProcessableDocument(ownership)).toBe(false);

    await service.recoverExpiredLeases();
    const fresh = await service.claimNextDueJob('worker-2');
    expect(fresh).not.toBeNull();
    expect(await service.ownsProcessableDocument(ownership)).toBe(false);
    expect(
      await service.ownsProcessableDocument({
        ...ownership,
        leaseId: fresh!.leaseId,
      }),
    ).toBe(true);
  });

  it('terminalizes an exhausted expired claim instead of reclaiming it forever', async () => {
    const { job } = await seedJob({
      state: 'CLAIMED',
      attempt: PROCESSING_MAX_ATTEMPTS,
      maxAttempts: PROCESSING_MAX_ATTEMPTS,
      leaseId: randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 1_000),
      claimedBy: WORKER,
    });

    expect(await service.recoverExpiredLeases()).toEqual({
      recovered: 0,
      failed: 1,
    });

    const row = await loadJob(job.id);
    expect(row.state).toBe('FAILED');
    expect(row.leaseId).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();
    expect(row.claimedBy).toBeNull();
    expect(row.lastError).toBe(LEASE_EXPIRED_ATTEMPTS_EXHAUSTED);
    expect(row.finishedAt).not.toBeNull();

    expect(await service.claimNextDueJob('worker-2')).toBeNull();
    expect(await service.recoverExpiredLeases()).toEqual({
      recovered: 0,
      failed: 0,
    });
  });

  it("cannot use one organization's lease against another organization's document", async () => {
    const a = await seedJob({ nextAttemptAt: new Date(Date.now() - 60_000) });
    const b = await seedJob({ nextAttemptAt: new Date(Date.now() - 30_000) });

    const claimedA = await service.claimNextDueJob(WORKER);
    expect(claimedA?.id).toBe(a.job.id);

    const before = await prisma.document.findUniqueOrThrow({
      where: { id: b.document.id },
    });

    expect(
      await service.ownsProcessableDocument({
        jobId: a.job.id,
        leaseId: claimedA!.leaseId,
        organizationId: a.organization.id,
        documentGeneration: a.document.generation,
        verifiedStorageKey: a.verifiedStorageKey,
      }),
    ).toBe(true);

    expect(
      await service.ownsProcessableDocument({
        jobId: a.job.id,
        leaseId: claimedA!.leaseId,
        organizationId: b.organization.id,
        documentGeneration: b.document.generation,
        verifiedStorageKey: b.verifiedStorageKey,
      }),
    ).toBe(false);

    const after = await prisma.document.findUniqueOrThrow({
      where: { id: b.document.id },
    });
    expect(after.generation).toBe(before.generation);
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.status).toBe('PROCESSING');
  });

  it('leaves the document generation and verified storage key unchanged on claim', async () => {
    const { job, document, verifiedStorageKey } = await seedJob();

    const claimed = await service.claimNextDueJob(WORKER);
    expect(claimed?.id).toBe(job.id);

    const reloaded = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(reloaded.generation).toBe(document.generation);
    expect(reloaded.storageKey).toBe(verifiedStorageKey);
    expect(reloaded.status).toBe('PROCESSING');

    const reloadedJob = await loadJob(job.id);
    expect(reloadedJob.documentGeneration).toBe(document.generation);
    expect(reloadedJob.verifiedStorageKey).toBe(verifiedStorageKey);
  });
});
