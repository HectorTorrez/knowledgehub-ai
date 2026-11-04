import type { Translator } from '~/lib/i18n/translate';
import { DOCX_CONTENT_TYPE } from './validation';

export type FailureAction = 'reprocess' | 'replace' | 'delete';

const FAILURE_REASON_KEYS = ['INVALID_DOCX', 'ARCHIVE_LIMIT_EXCEEDED'] as const;

const CONTENT_TYPE_KEYS: Record<string, 'pdf' | 'docx' | 'text' | 'markdown'> =
  {
    'application/pdf': 'pdf',
    [DOCX_CONTENT_TYPE]: 'docx',
    'text/plain': 'text',
    'text/markdown': 'markdown',
  };

export function documentFailureMessage(
  reason: string | null,
  t: Translator,
): string | null {
  if (reason === null) return null;
  const key = FAILURE_REASON_KEYS.find((candidate) => candidate === reason);
  return key ? t(`failureReasons.${key}`) : reason;
}

export function documentContentTypeLabel(
  contentType: string | null,
  t: Translator,
): string {
  if (contentType === null) return '—';
  const key = CONTENT_TYPE_KEYS[contentType];
  return key ? t(`contentTypes.${key}`) : contentType;
}

const PREVIEWABLE_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

export function canPreviewDocument(contentType: string | null): boolean {
  return contentType !== null && PREVIEWABLE_CONTENT_TYPES.has(contentType);
}

const FAILURE_REASONS = [
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
  'PROCESSING_FAILED',
] as const;

const REPLACE_REASONS = new Set<string>(
  FAILURE_REASONS.filter((reason) => reason !== 'PROCESSING_FAILED'),
);

export function documentFailureGuidance(
  reason: string | null,
  t: Translator,
): { title: string; description: string; action: FailureAction } {
  const known = FAILURE_REASONS.find((candidate) => candidate === reason);

  if (known === undefined) {
    return {
      title: t('documentFailure.fallback.title'),
      description: t('documentFailure.fallback.description'),
      action: 'delete',
    };
  }

  return {
    title: t(`documentFailure.${known}.title`),
    description: t(`documentFailure.${known}.description`),
    action: REPLACE_REASONS.has(known) ? 'replace' : 'reprocess',
  };
}
