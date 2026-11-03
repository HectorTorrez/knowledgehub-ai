import { describe, expect, it } from 'vitest';
import { documentFailureGuidance } from './document-display';

describe('documentFailureGuidance', () => {
  it.each(['EMPTY_OBJECT', 'SIZE_LIMIT_EXCEEDED', 'CONTENT_TYPE_NOT_ALLOWED', 'CONTENT_TYPE_MISMATCH', 'SIGNATURE_MISMATCH', 'CONTENT_UNSUPPORTED', 'CONTENT_CORRUPT', 'NO_EXTRACTABLE_TEXT', 'CONTENT_TOO_LARGE', 'VERIFIED_OBJECT_MISSING', 'STORAGE_INTEGRITY_VIOLATION'])('recommends replacing %s', (reason) => {
    expect(documentFailureGuidance(reason).action).toBe('Replace file');
  });
  it('recommends retrying processing failures and handles unknown reasons', () => {
    expect(documentFailureGuidance('PROCESSING_FAILED').action).toBe('Reprocess');
    expect(documentFailureGuidance(null).action).toBe('Delete');
    expect(documentFailureGuidance('NO_EXTRACTABLE_TEXT').description).toContain('scanned');
  });
});
