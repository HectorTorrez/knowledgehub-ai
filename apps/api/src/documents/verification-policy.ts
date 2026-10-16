import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
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
  const valid =
    contentType === 'application/pdf'
      ? containsPdfMagic(prefix)
      : isStrictUtf8Text(prefix);

  return valid ? null : 'SIGNATURE_MISMATCH';
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
