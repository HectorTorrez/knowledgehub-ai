import { isTransientTransactionFailure } from '../prisma/transient-transaction-errors.js';
import { ChunkLimitExceededError } from './chunking.policy.js';
import { EmbeddingRejectedError } from '../embeddings/embedding-provider.port.js';
import {
  DocumentExtractionError,
  DocumentResourceLimitError,
  UnsupportedDocumentTypeError,
} from './document-text-extractor.js';
import {
  ObjectStorageIntegrityError,
  ObjectVersionMismatchError,
} from '../storage/object-storage.port.js';

export const PROCESSING_FAILURE_REASONS = [
  'CONTENT_UNSUPPORTED',
  'CONTENT_CORRUPT',
  'NO_EXTRACTABLE_TEXT',
  'CONTENT_TOO_LARGE',
  'VERIFIED_OBJECT_MISSING',
  'STORAGE_INTEGRITY_VIOLATION',
  'PROCESSING_FAILED',
] as const;

export type ProcessingFailureReason = (typeof PROCESSING_FAILURE_REASONS)[number];

export type ProcessingFailureCategory = 'transient' | 'permanent';

export interface ProcessingFailure {
  category: ProcessingFailureCategory;
  reason: ProcessingFailureReason;
  detail: string;
}

const UNKNOWN_ERROR_DETAIL = 'UnclassifiedProcessingError';

export class ProcessingFailureError extends Error {
  constructor(
    readonly reason: ProcessingFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'ProcessingFailureError';
  }
}

function permanent(
  reason: ProcessingFailureReason,
  detail: string,
): ProcessingFailure {
  return { category: 'permanent', reason, detail };
}

function transient(detail: string): ProcessingFailure {
  return { category: 'transient', reason: 'PROCESSING_FAILED', detail };
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.name : UNKNOWN_ERROR_DETAIL;
}

export function classifyProcessingFailure(error: unknown): ProcessingFailure {
  if (error instanceof ProcessingFailureError) {
    return permanent(error.reason, `${error.name}: ${error.message}`);
  }

  if (error instanceof UnsupportedDocumentTypeError) {
    return permanent('CONTENT_UNSUPPORTED', `${error.name}: ${error.message}`);
  }

  if (error instanceof DocumentResourceLimitError) {
    return permanent('CONTENT_TOO_LARGE', `${error.name}: ${error.message}`);
  }

  if (error instanceof ChunkLimitExceededError) {
    return permanent('CONTENT_TOO_LARGE', `${error.name}: ${error.message}`);
  }

  if (error instanceof DocumentExtractionError) {
    return permanent('CONTENT_CORRUPT', `${error.name}: ${error.message}`);
  }

  if (
    error instanceof ObjectVersionMismatchError ||
    error instanceof ObjectStorageIntegrityError
  ) {
    return permanent(
      'STORAGE_INTEGRITY_VIOLATION',
      `${error.name}: ${error.message}`,
    );
  }

  if (error instanceof EmbeddingRejectedError) {
    return permanent('PROCESSING_FAILED', `${error.name}: ${error.message}`);
  }

  if (isTransientTransactionFailure(error)) {
    return transient(detailOf(error));
  }

  return transient(detailOf(error));
}
