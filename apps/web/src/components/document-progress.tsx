import type { DocumentSummary } from '@knowledgehub/shared-types';

const labels = { UPLOADING: 'Waiting for upload', QUEUED: 'Queued', PROCESSING: 'Processing document', ENRICHING: 'Preparing insights', READY: 'Ready', FAILED: 'Failed' };

export function DocumentProgress({ document }: Readonly<{ document: DocumentSummary }>) {
  const stage = document.processingStage;
  if (!stage) return null;
  return <div className="mt-1 text-xs text-muted-foreground" role="status">
    {labels[stage]}
    {document.retry ? ` · Retry ${document.retry.attempt} of ${document.retry.maxAttempts} after ${new Date(document.retry.nextRetryAt).toLocaleString()}` : null}
  </div>;
}
