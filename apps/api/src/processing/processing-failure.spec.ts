import { describe, expect, it } from 'vitest';
import {
  DocumentExtractionError,
  DocumentResourceLimitError,
  UnsupportedDocumentTypeError,
} from './document-text-extractor.js';
import {
  ObjectStorageIntegrityError,
  ObjectVersionMismatchError,
} from '../storage/object-storage.port.js';
import {
  classifyProcessingFailure,
  ProcessingFailureError,
} from './processing-failure.js';

describe('classifyProcessingFailure', () => {
  it('treats an unsupported content type as a permanent failure', () => {
    const failure = classifyProcessingFailure(
      new UnsupportedDocumentTypeError('application/octet-stream'),
    );

    expect(failure.category).toBe('permanent');
    expect(failure.reason).toBe('CONTENT_UNSUPPORTED');
  });

  it('treats a resource-limit violation as a permanent failure', () => {
    const failure = classifyProcessingFailure(
      new DocumentResourceLimitError('too many pages'),
    );

    expect(failure.category).toBe('permanent');
    expect(failure.reason).toBe('CONTENT_TOO_LARGE');
  });

  it('treats an unparseable document as a permanent failure', () => {
    const failure = classifyProcessingFailure(
      new DocumentExtractionError('The PDF could not be parsed'),
    );

    expect(failure.category).toBe('permanent');
    expect(failure.reason).toBe('CONTENT_CORRUPT');
  });

  it('treats a missing verified object as a permanent failure', () => {
    const failure = classifyProcessingFailure(
      new ProcessingFailureError('VERIFIED_OBJECT_MISSING', 'object absent'),
    );

    expect(failure.category).toBe('permanent');
    expect(failure.reason).toBe('VERIFIED_OBJECT_MISSING');
  });

  it('treats a storage integrity violation as a permanent failure', () => {
    const failure = classifyProcessingFailure(
      new ObjectVersionMismatchError(),
    );

    expect(failure.category).toBe('permanent');
    expect(failure.reason).toBe('STORAGE_INTEGRITY_VIOLATION');

    expect(
      classifyProcessingFailure(new ObjectStorageIntegrityError()).reason,
    ).toBe('STORAGE_INTEGRITY_VIOLATION');
  });

  it('treats an unclassified error as retryable', () => {
    const failure = classifyProcessingFailure(new Error('connection reset'));

    expect(failure.category).toBe('transient');
    expect(failure.reason).toBe('PROCESSING_FAILED');
  });

  it('never puts an unknown error message into the recorded detail', () => {
    const failure = classifyProcessingFailure(
      new Error('organizations/secret-key/verified'),
    );

    expect(failure.detail).toBe('Error');
  });

  it('classifies a non-error rejection as retryable', () => {
    const failure = classifyProcessingFailure('boom');

    expect(failure.category).toBe('transient');
    expect(failure.detail).toBe('UnclassifiedProcessingError');
  });
});
