import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PROCESSING_LEASE_DURATION_SECONDS } from './processing-lease.policy.js';
import { ProcessingJobService } from './processing-job.service.js';

interface QueryTagCall {
  strings: TemplateStringsArray;
  values: unknown[];
}

function queryHarness(rows: unknown[]) {
  const calls: QueryTagCall[] = [];
  const queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings, values });
      return rows;
    },
  );

  const service = new ProcessingJobService({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  return { service, queryRaw, calls };
}

function recoveryHarness(counts: number[]) {
  const executeRaw = vi.fn();
  for (const count of counts) {
    executeRaw.mockResolvedValueOnce(count);
  }

  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: executeRaw }),
  );

  const service = new ProcessingJobService({
    $transaction: transaction,
  } as unknown as PrismaService);

  return { service, transaction, executeRaw };
}

function transactionHarness(counts: number[]) {
  const executeRaw = vi.fn();
  for (const count of counts) {
    executeRaw.mockResolvedValueOnce(count);
  }

  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: executeRaw }),
  );

  const service = new ProcessingJobService({
    $transaction: transaction,
  } as unknown as PrismaService);

  return { service, transaction, executeRaw };
}

const OWNERSHIP = {
  jobId: 'job-1',
  leaseId: 'lease-1',
  organizationId: 'org-1',
  documentGeneration: 1,
  verifiedStorageKey: 'organizations/org-1/verified',
};

describe('ProcessingJobService', () => {
  describe('claimNextDueJob', () => {
    it('returns null when no job is due', async () => {
      const { service } = queryHarness([]);

      await expect(service.claimNextDueJob('worker-1')).resolves.toBeNull();
    });

    it('parameterizes the worker identity and lease duration', async () => {
      const row = {
        id: 'job-1',
        documentId: 'doc-1',
        organizationId: 'org-1',
        documentGeneration: 1,
        verifiedStorageKey: 'organizations/org-1/verified',
        attempt: 1,
        maxAttempts: 5,
        leaseId: 'lease-1',
        leaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
      };
      const { service, calls } = queryHarness([row]);

      await expect(service.claimNextDueJob('worker-1')).resolves.toEqual(row);

      const [query] = calls;
      expect(query.values).toContain('worker-1');
      expect(query.values).toContain(PROCESSING_LEASE_DURATION_SECONDS);
      expect(query.values).not.toContain('CLAIMED');
    });
  });

  describe('recoverExpiredLeases', () => {
    it('runs the recovery and terminal transitions in one transaction', async () => {
      const { service, transaction, executeRaw } = recoveryHarness([2, 1]);

      await expect(service.recoverExpiredLeases()).resolves.toEqual({
        recovered: 2,
        failed: 1,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('hasValidLease', () => {
    it('is true when the lease row is matched', async () => {
      const { service } = queryHarness([{ ok: 1 }]);
      await expect(
        service.hasValidLease({ jobId: 'job-1', leaseId: 'lease-1' }),
      ).resolves.toBe(true);
    });

    it('is false when the lease row is not matched', async () => {
      const { service } = queryHarness([]);
      await expect(
        service.hasValidLease({ jobId: 'job-1', leaseId: 'lease-1' }),
      ).resolves.toBe(false);
    });
  });

  describe('ownsProcessableDocument', () => {
    const ownership = {
      jobId: 'job-1',
      leaseId: 'lease-1',
      organizationId: 'org-1',
      documentGeneration: 1,
      verifiedStorageKey: 'organizations/org-1/verified',
    };

    it('is true when job and document predicates both match', async () => {
      const { service } = queryHarness([{ ok: 1 }]);
      await expect(service.ownsProcessableDocument(ownership)).resolves.toBe(
        true,
      );
    });

    it('is false when the predicates do not match', async () => {
      const { service } = queryHarness([]);
      await expect(service.ownsProcessableDocument(ownership)).resolves.toBe(
        false,
      );
    });
  });

  describe('renewLease', () => {
    it('is true when the unexpired lease is matched and renewed', async () => {
      const { service, calls } = queryHarness([{ id: 'job-1' }]);

      await expect(
        service.renewLease({ jobId: 'job-1', leaseId: 'lease-1' }),
      ).resolves.toBe(true);

      const [query] = calls;
      expect(query.values).toContain('job-1');
      expect(query.values).toContain('lease-1');
      expect(query.values).toContain(PROCESSING_LEASE_DURATION_SECONDS);
    });

    it('is false when the lease is stale or expired', async () => {
      const { service } = queryHarness([]);

      await expect(
        service.renewLease({ jobId: 'job-1', leaseId: 'lease-1' }),
      ).resolves.toBe(false);
    });
  });

  describe('publishExtraction', () => {
    const result = { content: 'extracted text', characterCount: 14 };

    it('inserts the result and completes the job in one transaction', async () => {
      const { service, transaction, executeRaw } = transactionHarness([1, 1]);

      await expect(service.publishExtraction(OWNERSHIP, result)).resolves.toBe(
        true,
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeRaw).toHaveBeenCalledTimes(2);

      const [insert] = executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(insert.join('?')).toContain('INSERT INTO "DocumentExtraction"');
      const insertValues = (executeRaw.mock.calls[0] as unknown[]).slice(1);
      expect(insertValues).toContain(result.content);
      expect(insertValues).toContain(result.characterCount);
      expect(insertValues).toContain(OWNERSHIP.jobId);
      expect(insertValues).toContain(OWNERSHIP.leaseId);
      expect(insertValues).toContain(OWNERSHIP.verifiedStorageKey);

      const [update] = executeRaw.mock.calls[1] as [TemplateStringsArray];
      expect(update.join('?')).toContain("state = 'SUCCEEDED'");
    });

    it('discards the result when no lease-matching row is written', async () => {
      const { service, executeRaw } = transactionHarness([0]);

      await expect(service.publishExtraction(OWNERSHIP, result)).resolves.toBe(
        false,
      );

      expect(executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
