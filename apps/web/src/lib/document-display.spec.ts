import { describe, expect, it } from 'vitest';
import { createTranslator } from '~/lib/i18n/translate';
import {
  documentContentTypeIcon,
  documentContentTypeLabel,
  documentFailureGuidance,
} from './document-display';

const t = createTranslator('en');

describe('documentFailureGuidance', () => {
  it.each([
    'EMPTY_OBJECT',
    'SIZE_LIMIT_EXCEEDED',
    'CONTENT_TYPE_NOT_ALLOWED',
    'CONTENT_TYPE_MISMATCH',
    'SIGNATURE_MISMATCH',
    'CONTENT_UNSUPPORTED',
    'CONTENT_CORRUPT',
    'NO_EXTRACTABLE_TEXT',
    'CONTENT_TOO_LARGE',
    'VERIFIED_OBJECT_MISSING',
    'STORAGE_INTEGRITY_VIOLATION',
  ])('recommends replacing %s', (reason) => {
    expect(documentFailureGuidance(reason, t).action).toBe('replace');
  });
  it('recommends retrying processing failures and handles unknown reasons', () => {
    expect(documentFailureGuidance('PROCESSING_FAILED', t).action).toBe(
      'reprocess',
    );
    expect(documentFailureGuidance(null, t).action).toBe('delete');
    expect(
      documentFailureGuidance('NO_EXTRACTABLE_TEXT', t).description,
    ).toContain('scanned');
  });
});

describe('document formats', () => {
  it.each([
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'PowerPoint',
      'Presentation',
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Excel',
      'Sheet',
    ],
    ['text/html', 'HTML', 'Globe'],
  ])('displays %s', (type, label, icon) => {
    expect(documentContentTypeLabel(type, t)).toBe(label);
    expect(documentContentTypeIcon(type).displayName).toBe(icon);
  });
});
