import { describe, expect, it } from 'vitest';
import { completeUploadSchema } from './complete-upload.schema.js';

describe('completeUploadSchema', () => {
  it('accepts a missing body', () => {
    expect(completeUploadSchema.parse(undefined)).toEqual({});
    expect(completeUploadSchema.parse({})).toEqual({});
  });

  it('accepts and trims a declared original file name', () => {
    const parsed = completeUploadSchema.parse({
      originalFileName: '  report.pdf  ',
    });

    expect(parsed.originalFileName).toBe('report.pdf');
  });

  it('accepts a name of exactly 255 characters', () => {
    const parsed = completeUploadSchema.parse({
      originalFileName: 'a'.repeat(255),
    });

    expect(parsed.originalFileName).toHaveLength(255);
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(
      completeUploadSchema.safeParse({ originalFileName: '' }).success,
    ).toBe(false);
    expect(
      completeUploadSchema.safeParse({ originalFileName: '   ' }).success,
    ).toBe(false);
  });

  it('rejects a name longer than 255 characters', () => {
    expect(
      completeUploadSchema.safeParse({ originalFileName: 'a'.repeat(256) })
        .success,
    ).toBe(false);
  });

  it('rejects a name containing control characters', () => {
    expect(
      completeUploadSchema.safeParse({ originalFileName: 'report\u0000.pdf' })
        .success,
    ).toBe(false);
    expect(
      completeUploadSchema.safeParse({ originalFileName: 'report\n.pdf' })
        .success,
    ).toBe(false);
  });

  it('rejects an incorrectly typed name', () => {
    for (const originalFileName of [123, null, ['report.pdf'], true]) {
      expect(
        completeUploadSchema.safeParse({ originalFileName }).success,
      ).toBe(false);
    }
  });

  it('rejects client-supplied verified or storage fields', () => {
    for (const extra of [
      { sizeBytes: 1024 },
      { contentType: 'application/pdf' },
      { status: 'PROCESSING' },
      { storageKey: 'organizations/org-1/documents/doc-1/verified/x' },
      { uploadStorageKey: 'organizations/org-1/documents/doc-1/x' },
      { organizationId: 'org-1' },
    ]) {
      expect(completeUploadSchema.safeParse(extra).success).toBe(false);
    }
  });
});
