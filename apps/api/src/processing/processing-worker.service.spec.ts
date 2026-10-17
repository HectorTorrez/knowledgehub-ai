import { describe, expect, it, vi } from 'vitest';
import type { ObjectMetadata, ObjectStorage } from '../storage/object-storage.port.js';
import {
  EmbeddingRejectedError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import {
  DocumentTextExtractor,
  UnsupportedDocumentTypeError,
} from './document-text-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import {
  ProcessingJobService,
  type ClaimedProcessingJob,
} from './processing-job.service.js';
import { DocumentChunkStore } from './document-chunk.store.js';
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
    recordFailure: vi.fn(async () => true),
  };
  const extractor = {
    extract: vi.fn(async () => ({
      pages: [{ pageNumber: 1, content: 'Hello world' }],
      pageCount: 1,
      characterCount: 11,
    })),
  };
  const chunks = {
    replaceForGeneration: vi.fn(async () => true),
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
    chunks as unknown as DocumentChunkStore,
    config as unknown as ProcessingConfig,
    storage as unknown as ObjectStorage,
  );

  return { worker, jobs, extractor, chunks, config, storage };
}

const OWNED_CHUNKS = [
  { pageNumber: 1, chunkIndex: 0, content: 'Hello world', characterCount: 11 },
];

const OWNERSHIP = {
  jobId: JOB.id,
  leaseId: JOB.leaseId,
  organizationId: JOB.organizationId,
  documentGeneration: JOB.documentGeneration,
  verifiedStorageKey: JOB.verifiedStorageKey,
};

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
    it('chunks, embeds, and only then marks the document ready', async () => {
      const { worker, jobs, extractor, chunks, storage } = createWorker();

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
      expect(chunks.replaceForGeneration).toHaveBeenCalledWith(
        OWNERSHIP,
        OWNED_CHUNKS,
      );
      expect(jobs.publishExtraction).toHaveBeenCalledWith(OWNERSHIP, {
        pages: [{ pageNumber: 1, content: 'Hello world' }],
        pageCount: 1,
        characterCount: 11,
      });
      expect(
        chunks.replaceForGeneration.mock.invocationCallOrder[0],
      ).toBeLessThan(jobs.publishExtraction.mock.invocationCallOrder[0]!);
      expect(jobs.recordFailure).not.toHaveBeenCalled();
    });

    it('never readies the document when the generation is no longer owned', async () => {
      const { worker, jobs, chunks } = createWorker();
      chunks.replaceForGeneration.mockResolvedValueOnce(false);

      await worker.processJob(JOB);

      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).not.toHaveBeenCalled();
    });

    it('records a retryable failure when the embedding provider is unavailable', async () => {
      const { worker, jobs, chunks } = createWorker();
      chunks.replaceForGeneration.mockRejectedValueOnce(
        new EmbeddingUnavailableError('unavailable'),
      );

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();

      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'transient',
        reason: 'PROCESSING_FAILED',
        detail: 'EmbeddingUnavailableError',
      });
    });

    it('records a permanent failure when a chunk is rejected for embedding', async () => {
      const { worker, jobs, chunks } = createWorker();
      chunks.replaceForGeneration.mockRejectedValueOnce(
        new EmbeddingRejectedError('rejected'),
      );

      await worker.processJob(JOB);

      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'permanent',
        reason: 'PROCESSING_FAILED',
        detail: 'EmbeddingRejectedError: rejected',
      });
    });

    it('does not publish after losing its lease during extraction', async () => {
      const { worker, jobs, extractor, chunks } = createWorker({
        renewalIntervalMs: 1,
      });
      jobs.renewLease.mockResolvedValue(false);
      extractor.extract.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          pages: [{ pageNumber: 1, content: 'Hello world' }],
          pageCount: 1,
          characterCount: 11,
        };
      });

      await worker.processJob(JOB);

      expect(jobs.renewLease).toHaveBeenCalled();
      expect(chunks.replaceForGeneration).not.toHaveBeenCalled();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).not.toHaveBeenCalled();
    });

    it('records a permanent failure when the verified object is missing', async () => {
      const { worker, jobs, storage } = createWorker();
      storage.inspectObject.mockResolvedValueOnce(null);

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'permanent',
        reason: 'VERIFIED_OBJECT_MISSING',
        detail: expect.any(String),
      });
    });

    it('records a permanent failure for an unsupported document type', async () => {
      const { worker, jobs, extractor } = createWorker();
      extractor.extract.mockRejectedValueOnce(
        new UnsupportedDocumentTypeError('application/octet-stream'),
      );

      await worker.processJob(JOB);

      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'permanent',
        reason: 'CONTENT_UNSUPPORTED',
        detail: expect.any(String),
      });
    });

    it('records a retryable failure for an unclassified extraction error', async () => {
      const { worker, jobs, extractor } = createWorker();
      extractor.extract.mockRejectedValueOnce(new Error('parse failed'));

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'transient',
        reason: 'PROCESSING_FAILED',
        detail: 'Error',
      });
    });

    it('discards the result when the fenced publish rejects it', async () => {
      const { worker, jobs } = createWorker();
      jobs.publishExtraction.mockResolvedValueOnce(false);

      await expect(worker.processJob(JOB)).resolves.toBeUndefined();
      expect(jobs.publishExtraction).toHaveBeenCalledTimes(1);
      expect(jobs.recordFailure).not.toHaveBeenCalled();
    });

    it('refuses to extract an object above the size limit without reading it', async () => {
      const { worker, jobs, storage } = createWorker();
      storage.inspectObject.mockResolvedValueOnce({
        key: JOB.verifiedStorageKey,
        sizeBytes: 25 * 1024 * 1024 + 1,
        contentType: 'text/plain',
        version: 'version-1',
      });

      await worker.processJob(JOB);

      expect(storage.readObject).not.toHaveBeenCalled();
      expect(jobs.recordFailure).toHaveBeenCalledWith(OWNERSHIP, {
        category: 'permanent',
        reason: 'CONTENT_TOO_LARGE',
        detail: expect.any(String),
      });
    });
  });
});
