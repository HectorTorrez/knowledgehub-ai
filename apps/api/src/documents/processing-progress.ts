import type {
  DocumentProcessingStage,
  DocumentStatus,
} from '@knowledgehub/shared-types';

interface ProcessingJobProgress {
  state: 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED';
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: Date;
}

export interface ProcessingProgress {
  processingStage: DocumentProcessingStage;
  retry: { attempt: number; maxAttempts: number; nextRetryAt: string } | null;
}

function stageOf(
  status: DocumentStatus,
  job: ProcessingJobProgress | undefined,
): DocumentProcessingStage {
  if (status === 'PENDING') return 'UPLOADING';
  if (status === 'READY') return 'READY';
  if (status === 'FAILED') return 'FAILED';
  return job?.state === 'CLAIMED' ? 'PROCESSING' : 'QUEUED';
}

export function deriveProcessingProgress(document: {
  status: DocumentStatus;
  processingJobs: ProcessingJobProgress[];
}): ProcessingProgress {
  const job = document.processingJobs[0];
  const retrying =
    document.status === 'PROCESSING' &&
    job?.state === 'QUEUED' &&
    job.attempt > 0;

  return {
    processingStage: stageOf(document.status, job),
    retry: retrying
      ? {
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          nextRetryAt: job.nextAttemptAt.toISOString(),
        }
      : null,
  };
}
