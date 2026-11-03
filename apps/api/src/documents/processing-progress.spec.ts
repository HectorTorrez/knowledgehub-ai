import { describe, expect, it } from 'vitest';
import { deriveProcessingProgress } from './processing-progress.js';

const processing = { status: 'PROCESSING' as const, processingJobs: [] };
const nextAttemptAt = new Date('2026-01-01T00:00:00Z');

describe('deriveProcessingProgress', () => {
  it('maps each lifecycle state to a stage', () => {
    expect(
      deriveProcessingProgress({ ...processing, status: 'PENDING' })
        .processingStage,
    ).toBe('UPLOADING');
    expect(deriveProcessingProgress(processing).processingStage).toBe('QUEUED');
    expect(
      deriveProcessingProgress({ ...processing, status: 'READY' })
        .processingStage,
    ).toBe('READY');
    expect(
      deriveProcessingProgress({ ...processing, status: 'FAILED' })
        .processingStage,
    ).toBe('FAILED');
  });

  it('reports a claimed job as processing', () => {
    expect(
      deriveProcessingProgress({
        ...processing,
        processingJobs: [
          { state: 'CLAIMED', attempt: 1, maxAttempts: 3, nextAttemptAt },
        ],
      }),
    ).toEqual({ processingStage: 'PROCESSING', retry: null });
  });

  it('exposes a scheduled retry without job diagnostics', () => {
    expect(
      deriveProcessingProgress({
        ...processing,
        processingJobs: [
          { state: 'QUEUED', attempt: 1, maxAttempts: 3, nextAttemptAt },
        ],
      }),
    ).toEqual({
      processingStage: 'QUEUED',
      retry: {
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: nextAttemptAt.toISOString(),
      },
    });
  });

  it('treats a ready document as ready while enrichment is pending', () => {
    expect(
      deriveProcessingProgress({ ...processing, status: 'READY' })
        .processingStage,
    ).toBe('READY');
  });
});
