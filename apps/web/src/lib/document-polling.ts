import type {
  DocumentStatus,
  DocumentSummary,
} from '@knowledgehub/shared-types';

export function isProcessing(
  document: Pick<DocumentSummary, 'status' | 'processingStage'>,
) {
  return (
    document.status === 'PENDING' ||
    document.status === 'PROCESSING' ||
    document.processingStage === 'ENRICHING'
  );
}

export function pollingInterval(
  documents: Pick<DocumentSummary, 'status' | 'processingStage'>[],
  visible: boolean,
) {
  return visible && documents.some(isProcessing) ? 2500 : false;
}

export function terminalTransition(
  previous: DocumentStatus | undefined,
  current: DocumentStatus,
) {
  if (previous !== 'PENDING' && previous !== 'PROCESSING') return undefined;
  return current === 'READY' || current === 'FAILED' ? current : undefined;
}
