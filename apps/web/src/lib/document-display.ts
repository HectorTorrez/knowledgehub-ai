import { DOCX_CONTENT_TYPE } from './validation';

const FAILURE_MESSAGES: Record<string, string> = {
  INVALID_DOCX:
    'This Word document is invalid or damaged. Upload a valid .docx file.',
  ARCHIVE_LIMIT_EXCEEDED:
    'This Word document exceeds the archive safety limits. Upload a smaller document.',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  [DOCX_CONTENT_TYPE]: 'Word document (.docx)',
  'text/plain': 'Plain text',
  'text/markdown': 'Markdown',
};

export function documentFailureMessage(reason: string | null): string | null {
  if (reason === null) return null;
  return FAILURE_MESSAGES[reason] ?? reason;
}

export function documentContentTypeLabel(contentType: string | null): string {
  if (contentType === null) return '—';
  return CONTENT_TYPE_LABELS[contentType] ?? contentType;
}
