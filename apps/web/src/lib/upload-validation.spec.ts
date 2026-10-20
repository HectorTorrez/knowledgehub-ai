import { describe, expect, it } from 'vitest';
import {
  evaluateUploadMetadata,
  evaluateUploadSignature,
  MAX_PROCESSABLE_UPLOAD_BYTES,
  resolveUploadContentType,
  validateUploadFile,
} from './upload-validation';

const encoder = new TextEncoder();

function makeFile(
  bytes: Uint8Array | string,
  name: string,
  type: string,
): File {
  const content = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);

  return new File([buffer], name, { type });
}

describe('resolveUploadContentType', () => {
  it('keeps an allowed content type reported by the browser', () => {
    expect(
      resolveUploadContentType(makeFile('', 'report.pdf', 'application/pdf')),
    ).toBe('application/pdf');
  });

  it('infers the content type from the extension when the browser reports none', () => {
    expect(resolveUploadContentType(makeFile('', 'report.pdf', ''))).toBe(
      'application/pdf',
    );
    expect(
      resolveUploadContentType(
        makeFile('', 'notes.md', 'application/octet-stream'),
      ),
    ).toBe('text/markdown');
  });

  it('leaves an unsupported content type unchanged', () => {
    expect(
      resolveUploadContentType(makeFile('', 'photo.png', 'image/png')),
    ).toBe('image/png');
    expect(resolveUploadContentType(makeFile('', 'archive.zip', ''))).toBe('');
  });
});

describe('evaluateUploadMetadata', () => {
  it('rejects an empty file', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 0, contentType: 'application/pdf' }),
    ).toBe('EMPTY_FILE');
  });

  it('rejects a file above the processable size', () => {
    expect(
      evaluateUploadMetadata({
        sizeBytes: MAX_PROCESSABLE_UPLOAD_BYTES + 1,
        contentType: 'application/pdf',
      }),
    ).toBe('SIZE_LIMIT_EXCEEDED');
  });

  it('accepts a file exactly at the processable size', () => {
    expect(
      evaluateUploadMetadata({
        sizeBytes: MAX_PROCESSABLE_UPLOAD_BYTES,
        contentType: 'application/pdf',
      }),
    ).toBeNull();
  });

  it('rejects an unsupported content type', () => {
    expect(
      evaluateUploadMetadata({ sizeBytes: 1, contentType: 'image/png' }),
    ).toBe('CONTENT_TYPE_NOT_ALLOWED');
  });
});

describe('evaluateUploadSignature', () => {
  it('accepts a PDF signature at the start of the prefix', () => {
    expect(
      evaluateUploadSignature(
        'application/pdf',
        encoder.encode('%PDF-1.7\n'),
      ),
    ).toBeNull();
  });

  it('accepts a PDF signature later in the prefix', () => {
    expect(
      evaluateUploadSignature(
        'application/pdf',
        encoder.encode('\n\n%PDF-1.7\n'),
      ),
    ).toBeNull();
  });

  it('rejects a PDF without its signature', () => {
    expect(
      evaluateUploadSignature(
        'application/pdf',
        encoder.encode('not a pdf'),
      ),
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('accepts valid UTF-8 text', () => {
    expect(
      evaluateUploadSignature('text/plain', encoder.encode('hello\nworld')),
    ).toBeNull();
    expect(
      evaluateUploadSignature('text/markdown', encoder.encode('# Title')),
    ).toBeNull();
  });

  it('rejects text containing a NUL byte', () => {
    expect(
      evaluateUploadSignature('text/plain', Uint8Array.of(0x68, 0x00, 0x69)),
    ).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects bytes that are not valid UTF-8', () => {
    expect(
      evaluateUploadSignature('text/plain', Uint8Array.of(0xff, 0xfe)),
    ).toBe('SIGNATURE_MISMATCH');
  });
});

describe('validateUploadFile', () => {
  it('accepts a valid PDF', async () => {
    const result = await validateUploadFile(
      makeFile('%PDF-1.7\nbody', 'report.pdf', 'application/pdf'),
    );

    expect(result).toEqual({ ok: true, contentType: 'application/pdf' });
  });

  it('accepts a valid Markdown file whose browser type is missing', async () => {
    const result = await validateUploadFile(
      makeFile('# Title\n\nBody', 'notes.md', ''),
    );

    expect(result).toEqual({ ok: true, contentType: 'text/markdown' });
  });

  it('rejects a file whose contents do not match its type', async () => {
    const result = await validateUploadFile(
      makeFile('plain text', 'report.pdf', 'application/pdf'),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects an unsupported file type before reading the file', async () => {
    const result = await validateUploadFile(
      makeFile('png bytes', 'photo.png', 'image/png'),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'CONTENT_TYPE_NOT_ALLOWED',
    });
  });

  it('rejects an empty file', async () => {
    const result = await validateUploadFile(
      makeFile('', 'empty.txt', 'text/plain'),
    );

    expect(result).toMatchObject({ ok: false, reason: 'EMPTY_FILE' });
  });

  it('rejects a file above the processable size', async () => {
    const file = makeFile('%PDF-1.7', 'big.pdf', 'application/pdf');
    Object.defineProperty(file, 'size', {
      value: MAX_PROCESSABLE_UPLOAD_BYTES + 1,
    });

    const result = await validateUploadFile(file);

    expect(result).toMatchObject({
      ok: false,
      reason: 'SIZE_LIMIT_EXCEEDED',
    });
  });

  it('states the processable limit in the size rejection message', async () => {
    const file = makeFile('%PDF-1.7', 'big.pdf', 'application/pdf');
    Object.defineProperty(file, 'size', {
      value: MAX_PROCESSABLE_UPLOAD_BYTES + 1,
    });

    const result = await validateUploadFile(file);

    expect(result.ok ? '' : result.message).toContain('25.0 MB');
  });
});
