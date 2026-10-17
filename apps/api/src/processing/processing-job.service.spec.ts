import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PROCESSING_LEASE_DURATION_SECONDS } from './processing-lease.policy.js';
import { processingRetryDelayMs } from './processing-retry.policy.js';
import { ProcessingJobService } from './processing-job.service.js';

interface QueryTagCall {
  strings: TemplateStringsArray;
  values: unknown[];
}

interface ExecuteTagCall {
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

function transactionHarness(counts: {
  executeRaw?: number[];
  queryRaw?: unknown[];
}) {
  const executeCalls: ExecuteTagCall[] = [];
  const executeRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executeCalls.push({ strings, values });
      return counts.executeRaw?.[executeCalls.length - 1] ?? 0;
    },
  );

  const queryCalls: QueryTagCall[] = [];
  const queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queryCalls.push({ strings, values });
      return counts.queryRaw?.[queryCalls.length - 1] ?? [];
    },
  );

  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: executeRaw, $queryRaw: queryRaw }),
  );

  const service = new ProcessingJobService({
    $transaction: transaction,
  } as unknown as PrismaService);

  return { service, transaction, executeRaw, executeCalls, queryRaw, queryCalls };
}

const OWNERSHIP = {
  jobId: 'job-1',
  leaseId: 'lease-1',
  organizationId: 'org-1',
  documentGeneration: 1,
  verifiedStorageKey: 'organizations/org-1/verified',
};

function sqlOf(call: { strings: TemplateStringsArray }): string {
  return call.strings.join('?');
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
    it('requeues recoverable claims and fails exhausted jobs with their documents', async () => {
      const { service, transaction, executeRaw, queryCalls } =
        transactionHarness({
          executeRaw: [2],
          queryRaw: [[{ failed: 1 }]],
        });

      await expect(service.recoverExpiredLeases()).resolves.toEqual({
        recovered: 2,
        failed: 1,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(queryCalls).toHaveLength(1);

      const failureSql = sqlOf(queryCalls[0]!);
      expect(failureSql).toContain('UPDATE "DocumentProcessingJob"');
      expect(failureSql).toContain('UPDATE "Document"');
      expect(failureSql).toContain('"generation" = e."documentGeneration"');
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
    it('is true when job and document predicates both match', async () => {
      const { service } = queryHarness([{ ok: 1 }]);
      await expect(service.ownsProcessableDocument(OWNERSHIP)).resolves.toBe(
        true,
      );
    });

    it('is false when the predicates do not match', async () => {
      const { service } = queryHarness([]);
      await expect(service.ownsProcessableDocument(OWNERSHIP)).resolves.toBe(
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
    const result = {
      pages: [{ pageNumber: 1, content: 'extracted text' }],
      pageCount: 1,
      characterCount: 14,
    };

    it('inserts the result, completes the job, and readies the document in one transaction', async () => {
      const { service, transaction, executeCalls } = transactionHarness({
        executeRaw: [1, 1, 1],
      });

      await expect(service.publishExtraction(OWNERSHIP, result)).resolves.toBe(
        true,
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeCalls).toHaveLength(3);

      const [insert, complete, ready] = executeCalls;
      expect(sqlOf(insert!)).toContain('INSERT INTO "DocumentExtraction"');
      expect(sqlOf(insert!)).toContain('"pages"');
      expect(sqlOf(insert!)).toContain('"pageCount"');
      expect(insert!.values).toContain(JSON.stringify(result.pages));
      expect(insert!.values).toContain(OWNERSHIP.leaseId);
      expect(sqlOf(complete!)).toContain("state = 'SUCCEEDED'");
      expect(sqlOf(ready!)).toContain("status = 'READY'");
      expect(sqlOf(ready!)).toContain('d."generation" = j."documentGeneration"');
    });

    it('discards the result when no lease-matching row is written', async () => {
      const { service, executeCalls } = transactionHarness({ executeRaw: [0] });

      await expect(service.publishExtraction(OWNERSHIP, result)).resolves.toBe(
        false,
      );

      expect(executeCalls).toHaveLength(1);
    });

    it('rolls back when the job cannot be completed', async () => {
      const { service, executeCalls } = transactionHarness({
        executeRaw: [1, 0],
      });

      await expect(
        service.publishExtraction(OWNERSHIP, result),
      ).rejects.toThrow();

      expect(executeCalls).toHaveLength(2);
    });

    it('rolls back when the document cannot be readied', async () => {
      const { service, executeCalls } = transactionHarness({
        executeRaw: [1, 1, 0],
      });

      await expect(
        service.publishExtraction(OWNERSHIP, result),
      ).rejects.toThrow();

      expect(executeCalls).toHaveLength(3);
    });
  });

  describe('recordFailure', () => {
    it('is a no-op when the lease no longer owns the job', async () => {
      const { service, queryRaw, executeCalls } = transactionHarness({
        queryRaw: [[]],
      });

      await expect(
        service.recordFailure(OWNERSHIP, {
          category: 'permanent',
          reason: 'CONTENT_CORRUPT',
          detail: 'DocumentExtractionError',
        }),
      ).resolves.toBe(false);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(executeCalls).toHaveLength(0);
    });

    it('requeues a transient failure with an exponential backoff', async () => {
      const { service, executeCalls } = transactionHarness({
        queryRaw: [[{ id: 'job-1', attempt: 2, maxAttempts: 5 }]],
        executeRaw: [1],
      });

      await expect(
        service.recordFailure(OWNERSHIP, {
          category: 'transient',
          reason: 'PROCESSING_FAILED',
          detail: 'TimeoutError',
        }),
      ).resolves.toBe(true);

      expect(executeCalls).toHaveLength(1);
      const [requeue] = executeCalls;
      expect(sqlOf(requeue!)).toContain("state = 'QUEUED'");
      expect(requeue!.values).toContain(processingRetryDelayMs(2));
      expect(requeue!.values).toContain('TimeoutError');
    });

    it('fails the job and document when the retry budget is exhausted', async () => {
      const { service, executeCalls } = transactionHarness({
        queryRaw: [[{ id: 'job-1', attempt: 5, maxAttempts: 5 }]],
        executeRaw: [1, 1],
      });

      await expect(
        service.recordFailure(OWNERSHIP, {
          category: 'transient',
          reason: 'PROCESSING_FAILED',
          detail: 'TimeoutError',
        }),
      ).resolves.toBe(true);

      expect(executeCalls).toHaveLength(2);
      const [failJob, failDocument] = executeCalls;
      expect(sqlOf(failJob!)).toContain("state = 'FAILED'");
      expect(sqlOf(failDocument!)).toContain("status = 'FAILED'");
      expect(failDocument!.values).toContain('PROCESSING_FAILED');
      expect(sqlOf(failDocument!)).toContain("'PROCESSING'");
    });

    it('fails permanently without consuming the retry budget', async () => {
      const { service, executeCalls } = transactionHarness({
        queryRaw: [[{ id: 'job-1', attempt: 1, maxAttempts: 5 }]],
        executeRaw: [1, 1],
      });

      await expect(
        service.recordFailure(OWNERSHIP, {
          category: 'permanent',
          reason: 'CONTENT_CORRUPT',
          detail: 'DocumentExtractionError',
        }),
      ).resolves.toBe(true);

      expect(executeCalls).toHaveLength(2);
      const [failJob, failDocument] = executeCalls;
      expect(sqlOf(failJob!)).toContain("state = 'FAILED'");
      expect(failDocument!.values).toContain('CONTENT_CORRUPT');
      expect(sqlOf(failDocument!)).toContain(
        'd."generation" = j."documentGeneration"',
      );
    });
  });
});
