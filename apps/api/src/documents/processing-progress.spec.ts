import { describe, expect, it } from 'vitest';
import { deriveProcessingProgress } from './processing-progress.js';

const base = { status: 'PROCESSING' as const, factsStatus: 'PENDING' as const, summaryStatus: 'PENDING' as const, processingJobs: [] };

describe('deriveProcessingProgress', () => {
  it('reports persisted lifecycle states', () => {
    expect(deriveProcessingProgress({ ...base, status: 'PENDING' }).processingStage).toBe('UPLOADING');
    expect(deriveProcessingProgress(base).processingStage).toBe('QUEUED');
    expect(deriveProcessingProgress({ ...base, status: 'READY' }).processingStage).toBe('ENRICHING');
    expect(deriveProcessingProgress({ ...base, status: 'READY', factsStatus: 'READY', summaryStatus: 'FAILED' }).processingStage).toBe('READY');
    expect(deriveProcessingProgress({ ...base, status: 'FAILED' }).processingStage).toBe('FAILED');
  });
  it('exposes a scheduled retry without job diagnostics', () => {
    const nextAttemptAt = new Date('2026-01-01T00:00:00Z');
    expect(deriveProcessingProgress({ ...base, processingJobs: [{ state: 'QUEUED', attempt: 1, maxAttempts: 3, nextAttemptAt }] })).toEqual({ processingStage: 'QUEUED', retry: { attempt: 1, maxAttempts: 3, nextRetryAt: nextAttemptAt.toISOString() } });
    expect(deriveProcessingProgress({ ...base, processingJobs: [{ state: 'CLAIMED', attempt: 1, maxAttempts: 3, nextAttemptAt }] })).toEqual({ processingStage: 'PROCESSING', retry: null });
  });
});
