import { fromBuffer } from 'yauzl';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  DOCX_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  PPTX_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  SIGNATURE_PREFIX_BYTES,
  type AllowedUploadContentType,
  type UploadFailureReason,
} from './upload-policy.js';

const PDF_MAGIC = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d);
const NUL_BYTE = 0x00;

export interface InspectedMetadata {
  sizeBytes: number;
  contentType: string | null;
}

export function isAllowedUploadContentType(
  value: string,
): value is AllowedUploadContentType {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

export function evaluateUploadMetadata(
  metadata: InspectedMetadata,
  expectedContentType: string,
): UploadFailureReason | null {
  if (metadata.sizeBytes === 0) {
    return 'EMPTY_OBJECT';
  }

  if (metadata.sizeBytes > MAX_UPLOAD_BYTES) {
    return 'SIZE_LIMIT_EXCEEDED';
  }

  const actual = metadata.contentType;
  if (actual === null || !isAllowedUploadContentType(actual)) {
    return 'CONTENT_TYPE_NOT_ALLOWED';
  }

  if (actual !== expectedContentType) {
    return 'CONTENT_TYPE_MISMATCH';
  }

  return null;
}

export function evaluateUploadSignature(
  contentType: string,
  prefix: Uint8Array,
): UploadFailureReason | null {
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

export async function evaluateOfficeArchive(
  contentType: string,
  bytes: Uint8Array,
): Promise<UploadFailureReason | null> {
  const required =
    contentType === PPTX_CONTENT_TYPE
      ? 'ppt/presentation.xml'
      : contentType === XLSX_CONTENT_TYPE
        ? 'xl/workbook.xml'
        : null;
  if (!required) return null;
  return new Promise((resolve) => {
    fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return resolve('SIGNATURE_MISMATCH');
      let found = false;
      zip.on('error', () => resolve('SIGNATURE_MISMATCH'));
      zip.on('entry', (entry) => {
        if (entry.fileName === required) found = true;
        zip.readEntry();
      });
      zip.on('end', () => resolve(found ? null : 'SIGNATURE_MISMATCH'));
      zip.readEntry();
    });
  });
}
