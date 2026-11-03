import type { DocumentProcessingStage, DocumentStatus } from '@knowledgehub/shared-types';

export function deriveProcessingProgress(document: {
  status: DocumentStatus;
  factsStatus: 'PENDING' | 'READY' | 'FAILED';
  summaryStatus: 'PENDING' | 'READY' | 'FAILED';
  processingJobs: Array<{ state: 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED'; attempt: number; maxAttempts: number; nextAttemptAt: Date }>;
}): { processingStage: DocumentProcessingStage; retry: { attempt: number; maxAttempts: number; nextRetryAt: string } | null } {
  const job = document.processingJobs?.[0];
  let processingStage: DocumentProcessingStage;
  if (document.status === 'FAILED') processingStage = 'FAILED';
  else if (document.status === 'PENDING') processingStage = 'UPLOADING';
  else if (document.status === 'READY') processingStage = document.factsStatus === 'PENDING' || document.summaryStatus === 'PENDING' ? 'ENRICHING' : 'READY';
  else processingStage = job?.state === 'CLAIMED' ? 'PROCESSING' : 'QUEUED';
  return {
    processingStage,
    retry: document.status === 'PROCESSING' && job?.state === 'QUEUED' && job.attempt > 0
      ? { attempt: job.attempt, maxAttempts: job.maxAttempts, nextRetryAt: job.nextAttemptAt.toISOString() }
      : null,
  };
}
