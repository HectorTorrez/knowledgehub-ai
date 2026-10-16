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
});
