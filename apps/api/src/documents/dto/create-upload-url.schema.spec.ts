import { describe, expect, it } from 'vitest';
import { MAX_EXTRACTABLE_BYTES } from '../../processing/processing-limits.policy.js';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from '../upload-policy.js';
import { createUploadUrlSchema } from './create-upload-url.schema.js';

describe('createUploadUrlSchema', () => {
  it('accepts each allowlisted content type', () => {
    for (const contentType of ALLOWED_UPLOAD_CONTENT_TYPES) {
      const parsed = createUploadUrlSchema.parse({ contentType });
      expect(parsed.contentType).toBe(contentType);
    }
  });

  it('accepts an omitted sizeBytes', () => {
    const parsed = createUploadUrlSchema.parse({
      contentType: 'application/pdf',
    });
    expect(parsed).toEqual({ contentType: 'application/pdf' });
  });

  it('accepts a positive integer sizeBytes', () => {
    const parsed = createUploadUrlSchema.parse({
      contentType: 'application/pdf',
      sizeBytes: 1,
    });
    expect(parsed.sizeBytes).toBe(1);
  });

  it('accepts a declared size above the policy cap, leaving enforcement to the service', () => {
    const parsed = createUploadUrlSchema.parse({
      contentType: 'application/pdf',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(parsed.sizeBytes).toBe(MAX_UPLOAD_BYTES + 1);
  });

  it('rejects a missing contentType', () => {
    expect(createUploadUrlSchema.safeParse({}).success).toBe(false);
    expect(
      createUploadUrlSchema.safeParse({ sizeBytes: 1024 }).success,
    ).toBe(false);
  });

  it('rejects a non-allowlisted or incorrectly typed content type', () => {
    for (const contentType of [
      'image/png',
      'text/html',
      'application/octet-stream',
      'application/PDF',
      '',
      123,
      null,
      ['application/pdf'],
    ]) {
      expect(
        createUploadUrlSchema.safeParse({ contentType }).success,
      ).toBe(false);
    }
  });

  it('rejects a sizeBytes that is zero or negative', () => {
    for (const sizeBytes of [0, -1]) {
      expect(
        createUploadUrlSchema.safeParse({
          contentType: 'application/pdf',
          sizeBytes,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects a sizeBytes that is not an integer or not a number', () => {
    for (const sizeBytes of [1.5, '1024', null, true]) {
      expect(
        createUploadUrlSchema.safeParse({
          contentType: 'application/pdf',
          sizeBytes,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects client-supplied identity or storage fields', () => {
    for (const extra of [
      { organizationId: 'org-1' },
      { documentId: 'doc-1' },
      { storageKey: 'organizations/org-1/documents/doc-1/abc' },
      { bucket: 'knowledgehub-documents' },
      { status: 'READY' },
      { method: 'PUT' },
    ]) {
      expect(
        createUploadUrlSchema.safeParse({
          contentType: 'application/pdf',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});

describe('upload policy', () => {
  it('pins the upload cap to the extraction limit', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBe(MAX_EXTRACTABLE_BYTES);
  });

  it('allows exactly PDF, plain text, and Markdown', () => {
    expect(ALLOWED_UPLOAD_CONTENT_TYPES).toEqual([
      'application/pdf',
      'text/plain',
      'text/markdown',
    ]);
  });
});
