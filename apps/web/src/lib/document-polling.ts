import type { DocumentSummary } from '@knowledgehub/shared-types';

export const POLL_INTERVAL_MS = 2500;
export const PENDING_UPLOAD_WINDOW_MS = 15 * 60 * 1000;

type PolledDocument = Pick<DocumentSummary, 'status' | 'updatedAt'>;

export function isProcessing(
  document: PolledDocument,
  now: number = Date.now(),
): boolean {
  if (document.status === 'PROCESSING') return true;
  if (document.status !== 'PENDING') return false;
  return now - Date.parse(document.updatedAt) < PENDING_UPLOAD_WINDOW_MS;
}

export function pollingInterval(
  documents: PolledDocument[],
  visible: boolean,
  now: number = Date.now(),
): number | false {
  return visible && documents.some((document) => isProcessing(document, now))
    ? POLL_INTERVAL_MS
    : false;
}
