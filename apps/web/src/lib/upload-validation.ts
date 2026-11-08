import type { Locale } from '~/lib/i18n/locale';
import type { Translator } from '~/lib/i18n/translate';
import { formatBytes } from './format';
import { DOCUMENT_TITLE_MAX_LENGTH } from './validation';
import {
  DOCX_CONTENT_TYPE,
  PPTX_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  isAllowedUploadContentType,
} from './validation';

export const SIGNATURE_PREFIX_BYTES = 1024;
export const MAX_PROCESSABLE_UPLOAD_BYTES = 10 * 1024 * 1024;

const PDF_MAGIC = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d);
const NUL_BYTE = 0x00;

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: DOCX_CONTENT_TYPE,
  pptx: PPTX_CONTENT_TYPE,
  xlsx: XLSX_CONTENT_TYPE,
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  text: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
};

export type UploadRejectionReason =
  | 'EMPTY_FILE'
  | 'SIZE_LIMIT_EXCEEDED'
  | 'CONTENT_TYPE_NOT_ALLOWED'
  | 'SIGNATURE_MISMATCH'
  | 'UNREADABLE_FILE';

export interface UploadValidationSuccess {
  ok: true;
  contentType: string;
}

export interface UploadValidationFailure {
  ok: false;
  reason: UploadRejectionReason;
}

export type UploadValidationResult =
  UploadValidationSuccess | UploadValidationFailure;

export function uploadRejectionMessage(
  reason: UploadRejectionReason,
  t: Translator,
  locale: Locale,
): string {
  return t(`upload.rejection.${reason}`, {
    size: formatBytes(MAX_PROCESSABLE_UPLOAD_BYTES, locale),
  });
}

export function resolveUploadContentType(file: File): string {
  if (isAllowedUploadContentType(file.type)) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_CONTENT_TYPES[extension] ?? file.type;
}

export function evaluateUploadMetadata(input: {
  sizeBytes: number;
  contentType: string;
}): UploadRejectionReason | null {
  if (input.sizeBytes === 0) {
    return 'EMPTY_FILE';
  }

  if (input.sizeBytes > MAX_PROCESSABLE_UPLOAD_BYTES) {
    return 'SIZE_LIMIT_EXCEEDED';
  }

  if (!isAllowedUploadContentType(input.contentType)) {
    return 'CONTENT_TYPE_NOT_ALLOWED';
  }

  return null;
}

export function evaluateUploadSignature(
  contentType: string,
  prefix: Uint8Array,
): UploadRejectionReason | null {
  return hasValidSignature(contentType, prefix) ? null : 'SIGNATURE_MISMATCH';
}

const ZIP_LOCAL_FILE_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;

function hasZipLocalFileHeader(prefix: Uint8Array): boolean {
  return ZIP_LOCAL_FILE_HEADER.every((byte, index) => prefix[index] === byte);
}

function hasValidSignature(contentType: string, prefix: Uint8Array): boolean {
  if (contentType === 'application/pdf') return containsPdfMagic(prefix);
  if (
    [DOCX_CONTENT_TYPE, PPTX_CONTENT_TYPE, XLSX_CONTENT_TYPE].includes(
      contentType,
    )
  )
    return hasZipLocalFileHeader(prefix);
  return isStrictUtf8Text(prefix);
}

export async function validateUploadFile(
  file: File,
): Promise<UploadValidationResult> {
  const contentType = resolveUploadContentType(file);
  const metadataFailure = evaluateUploadMetadata({
    sizeBytes: file.size,
    contentType,
  });

  if (metadataFailure) {
    return rejection(metadataFailure);
  }

  let prefix: Uint8Array;

  try {
    prefix = new Uint8Array(
      await file.slice(0, SIGNATURE_PREFIX_BYTES).arrayBuffer(),
    );
  } catch {
    return rejection('UNREADABLE_FILE');
  }

  const signatureFailure = evaluateUploadSignature(contentType, prefix);

  if (signatureFailure) {
    return rejection(signatureFailure);
  }

  return { ok: true, contentType };
}

function rejection(reason: UploadRejectionReason): UploadValidationFailure {
  return { ok: false, reason };
}

function containsPdfMagic(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, SIGNATURE_PREFIX_BYTES);

  for (let start = 0; start + PDF_MAGIC.length <= limit; start += 1) {
    let matched = true;

    for (let offset = 0; offset < PDF_MAGIC.length; offset += 1) {
      if (bytes[start + offset] !== PDF_MAGIC[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}

function isStrictUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(NUL_BYTE)) {
    return false;
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });

  try {
    decoder.decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

export function titleFromFileName(fileName: string, untitled: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  const title = stem.length > 0 ? stem : fileName.trim();

  return title.slice(0, DOCUMENT_TITLE_MAX_LENGTH) || untitled;
}
