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

const PREVIEWABLE_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

export function canPreviewDocument(contentType: string | null): boolean {
  return contentType !== null && PREVIEWABLE_CONTENT_TYPES.has(contentType);
}

type Guidance = { title: string; description: string; action: 'Reprocess' | 'Replace file' | 'Delete' };

const guidance: Record<string, Guidance> = {
  EMPTY_OBJECT: { title: 'The file is empty', description: 'Choose a file with content and upload it again.', action: 'Replace file' },
  SIZE_LIMIT_EXCEEDED: { title: 'The file is too large', description: 'Choose a smaller file and upload it again.', action: 'Replace file' },
  CONTENT_TYPE_NOT_ALLOWED: { title: 'File type not supported', description: 'Choose a supported file type and upload it again.', action: 'Replace file' },
  CONTENT_TYPE_MISMATCH: { title: 'File type does not match', description: 'Check the file type and upload it again.', action: 'Replace file' },
  SIGNATURE_MISMATCH: { title: 'File could not be verified', description: 'Choose a valid file and upload it again.', action: 'Replace file' },
  CONTENT_UNSUPPORTED: { title: 'File content is not supported', description: 'Convert the file to a supported format and upload it again.', action: 'Replace file' },
  CONTENT_CORRUPT: { title: 'File could not be read', description: 'Repair or export the file again, then upload it.', action: 'Replace file' },
  NO_EXTRACTABLE_TEXT: { title: 'No text found', description: 'The PDF may be scanned or image-only. Use OCR or upload a text-based file.', action: 'Replace file' },
  CONTENT_TOO_LARGE: { title: 'Document is too large to process', description: 'Split the document into smaller files and upload them.', action: 'Replace file' },
  VERIFIED_OBJECT_MISSING: { title: 'Original file is missing', description: 'Upload the file again to continue.', action: 'Replace file' },
  STORAGE_INTEGRITY_VIOLATION: { title: 'File integrity check failed', description: 'Upload the original file again.', action: 'Replace file' },
  PROCESSING_FAILED: { title: 'Processing failed', description: 'Try processing this document again.', action: 'Reprocess' },
};

export function documentFailureGuidance(reason: string | null): Guidance {
  return (reason && guidance[reason]) || { title: 'Document failed', description: 'Delete this document and upload it again.', action: 'Delete' };
}
