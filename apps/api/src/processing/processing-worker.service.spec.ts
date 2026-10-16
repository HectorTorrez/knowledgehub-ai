import { describe, expect, it, vi } from 'vitest';
import type { ObjectMetadata, ObjectStorage } from '../storage/object-storage.port.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import {
  ProcessingJobService,
  type ClaimedProcessingJob,
} from './processing-job.service.js';
import { ProcessingWorkerService } from './processing-worker.service.js';

const JOB: ClaimedProcessingJob = {
  id: 'job-1',
  documentId: 'doc-1',
  organizationId: 'org-1',
  documentGeneration: 1,
  verifiedStorageKey: 'organizations/org-1/documents/doc-1/verified/token',
  contentType: 'text/plain',
  attempt: 1,
  maxAttempts: 5,
  leaseId: 'lease-1',
  leaseExpiresAt: new Date(Date.now() + 60_000),
};

const BYTES = new TextEncoder().encode('Hello world');

function createWorker(overrides?: {
  renewalIntervalMs?: number;
  recoveryIntervalMs?: number;
}) {
  const jobs = {
    recoverExpiredLeases: vi.fn(async () => ({ recovered: 0, failed: 0 })),
    claimNextDueJob: vi.fn(async () => null as ClaimedProcessingJob | null),
    renewLease: vi.fn(async () => true),
    publishExtraction: vi.fn(async () => true),
  };
  const extractor = {
    extract: vi.fn(async () => ({ content: 'Hello world', characterCount: 11 })),
  };
  const config = {
    workerEnabled: false,
    pollIntervalMs: 1_000,
    renewalIntervalMs: overrides?.renewalIntervalMs ?? 1_000_000,
    recoveryIntervalMs: overrides?.recoveryIntervalMs ?? 0,
  };
  const storage = {
    inspectObject: vi.fn(
      async (): Promise<ObjectMetadata | null> => ({
        key: JOB.verifiedStorageKey,
        sizeBytes: BYTES.byteLength,
        contentType: 'text/plain',
        version: 'version-1',
      }),
    ),
    readObject: vi.fn(async () => BYTES.slice()),
  };

  const worker = new ProcessingWorkerService(
    jobs as unknown as ProcessingJobService,
    extractor as unknown as DocumentTextExtractor,
    config as unknown as ProcessingConfig,
    storage as unknown as ObjectStorage,
  );

  return { worker, jobs, extractor, config, storage };
}

describe('ProcessingWorkerService', () => {
  describe('runOnce', () => {
    it('recovers expired leases and reports an idle queue', async () => {
      const { worker, jobs } = createWorker({ recoveryIntervalMs: 0 });

      await expect(worker.runOnce()).resolves.toBe(false);
      expect(jobs.recoverExpiredLeases).toHaveBeenCalledTimes(1);
      expect(jobs.claimNextDueJob).toHaveBeenCalledTimes(1);
    });

    it('processes one claimed job', async () => {
      const { worker, jobs, extractor } = createWorker();
      jobs.claimNextDueJob.mockResolvedValueOnce(JOB);

      await expect(worker.runOnce()).resolves.toBe(true);
      expect(extractor.extract).toHaveBeenCalledTimes(1);
    });
  });

  describe('processJob', () => {
    it('reads the verified object and publishes the extraction it owns', async () => {
      const { worker, jobs, extractor, storage } = createWorker();

      await worker.processJob(JOB);

      expect(storage.inspectObject).toHaveBeenCalledWith(
        JOB.verifiedStorageKey,
      );
      expect(storage.readObject).toHaveBeenCalledWith({
        key: JOB.verifiedStorageKey,
        version: 'version-1',
      });
      expect(extractor.extract).toHaveBeenCalledWith({
        contentType: 'text/plain',
        bytes: BYTES,
      });
      expect(jobs.publishExtraction).toHaveBeenCalledWith(
        {
          jobId: JOB.id,
          leaseId: JOB.leaseId,
          organizationId: JOB.organizationId,
          documentGeneration: JOB.documentGeneration,
          verifiedStorageKey: JOB.verifiedStorageKey,
        },
        { content: 'Hello world', characterCount: 11 },
      );
    });

    it('does not publish after losing its lease during extraction', async () => {
      const { worker, jobs, extractor } = createWorker({
        renewalIntervalMs: 1,
      });
      jobs.renewLease.mockResolvedValue(false);
      extractor.extract.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { content: 'Hello world', characterCount: 11 };
      });

      await worker.processJob(JOB);

      expect(jobs.renewLease).toHaveBeenCalled();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
    });

    it('leaves the job for recovery when the verified object is missing', async () => {
      const { worker, jobs, storage } = createWorker();
      storage.inspectObject.mockResolvedValueOnce(null);

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
    });

    it('discards the result when the fenced publish rejects it', async () => {
      const { worker, jobs } = createWorker();
      jobs.publishExtraction.mockResolvedValueOnce(false);

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).toHaveBeenCalledTimes(1);
    });

    it('does not throw when extraction fails', async () => {
      const { worker, jobs, extractor } = createWorker();
      extractor.extract.mockRejectedValueOnce(new Error('parse failed'));

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
    });
  });
});
