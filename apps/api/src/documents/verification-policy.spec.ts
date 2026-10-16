import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_PREFIX_BYTES,
  type AllowedUploadContentType,
} from './upload-policy.js';
import {
  evaluateUploadMetadata,
  evaluateUploadSignature,
  isAllowedUploadContentType,
} from './verification-policy.js';

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

describe('isAllowedUploadContentType', () => {
  it('accepts exactly the allowlisted types', () => {
    expect(isAllowedUploadContentType('application/pdf')).toBe(true);
    expect(isAllowedUploadContentType('text/plain')).toBe(true);
    expect(isAllowedUploadContentType('text/markdown')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAllowedUploadContentType('image/png')).toBe(false);
    expect(isAllowedUploadContentType('application/octet-stream')).toBe(false);
    expect(isAllowedUploadContentType('')).toBe(false);
  });
});

describe('evaluateUploadMetadata', () => {
  const pdf: AllowedUploadContentType = 'application/pdf';

  it('accepts a positive size within the cap and the expected allowlisted type', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 1, contentType: pdf }, pdf),
    ).toBeNull();
  });

  it('accepts a size exactly at the cap', () => {
    expect(
      evaluateUploadMetadata(
        { sizeBytes: 2_000_000_000, contentType: pdf },
        pdf,
      ),
    ).toBeNull();
  });

  it('rejects an empty object', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 0, contentType: pdf }, pdf),
    ).toBe('EMPTY_OBJECT');
  });

  it('rejects a size above the cap', () => {
    expect(
      evaluateUploadMetadata(
        { sizeBytes: 2_000_000_001, contentType: pdf },
        pdf,
      ),
    ).toBe('SIZE_LIMIT_EXCEEDED');
  });

  it('checks size before content type', () => {
    expect(
      evaluateUploadMetadata(
        { sizeBytes: 2_000_000_001, contentType: 'image/png' },
        pdf,
      ),
    ).toBe('SIZE_LIMIT_EXCEEDED');
    expect(
      evaluateUploadMetadata({ sizeBytes: 0, contentType: 'image/png' }, pdf),
    ).toBe('EMPTY_OBJECT');
  });

  it('rejects a missing content type', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 10, contentType: null }, pdf),
    ).toBe('CONTENT_TYPE_NOT_ALLOWED');
  });

  it('rejects a content type outside the allowlist', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 10, contentType: 'image/png' }, pdf),
    ).toBe('CONTENT_TYPE_NOT_ALLOWED');
  });

  it('rejects an allowlisted type that differs from the expected type', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 10, contentType: 'text/plain' }, pdf),
    ).toBe('CONTENT_TYPE_MISMATCH');
  });
});

describe('evaluateUploadSignature', () => {
  it('accepts a PDF whose magic appears at the start', () => {
    expect(
      evaluateUploadSignature('application/pdf', bytes('%PDF-1.7\n')),
    ).toBeNull();
  });

  it('accepts a PDF whose magic appears within the inspected prefix', () => {
    const prefix = bytes(`${'x'.repeat(500)}%PDF-1.4\n`);

    expect(evaluateUploadSignature('application/pdf', prefix)).toBeNull();
  });

  it('accepts a PDF whose magic ends exactly at the prefix boundary', () => {
    const prefix = new Uint8Array(SIGNATURE_PREFIX_BYTES);
    prefix.set(bytes('%PDF-'), SIGNATURE_PREFIX_BYTES - 5);

    expect(evaluateUploadSignature('application/pdf', prefix)).toBeNull();
  });

  it('rejects a PDF whose magic is cut off at the prefix boundary', () => {
    const prefix = new Uint8Array(SIGNATURE_PREFIX_BYTES);
    prefix.set(bytes('%PDF'), SIGNATURE_PREFIX_BYTES - 4);

    expect(evaluateUploadSignature('application/pdf', prefix)).toBe(
      'SIGNATURE_MISMATCH',
    );
  });

  it('rejects bytes that do not contain the PDF magic', () => {
    expect(
      evaluateUploadSignature('application/pdf', bytes('NOT A PDF FILE')),
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects an empty prefix for a PDF', () => {
    expect(evaluateUploadSignature('application/pdf', new Uint8Array())).toBe(
      'SIGNATURE_MISMATCH',
    );
  });

  it('accepts strict UTF-8 text', () => {
    expect(evaluateUploadSignature('text/plain', bytes('hello world'))).toBeNull();
    expect(
      evaluateUploadSignature('text/markdown', bytes('# Heading\n')),
    ).toBeNull();
  });

  it('accepts a multibyte sequence split at the prefix boundary', () => {
    const prefix = new Uint8Array([...bytes('café'), 0xc3]);

    expect(evaluateUploadSignature('text/plain', prefix)).toBeNull();
  });

  it('rejects malformed UTF-8', () => {
    expect(
      evaluateUploadSignature('text/plain', new Uint8Array([0x68, 0xc3, 0x28])),
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects a lone continuation byte', () => {
    expect(
      evaluateUploadSignature('text/plain', new Uint8Array([0x68, 0xff, 0x69])),
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects a NUL byte in text', () => {
    expect(
      evaluateUploadSignature('text/plain', new Uint8Array([0x68, 0x00, 0x69])),
    ).toBe('SIGNATURE_MISMATCH');
  });
});
