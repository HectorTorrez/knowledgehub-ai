import { describe, expect, it } from 'vitest';
import {
  createDocumentStorageKey,
  createVerifiedStorageKey,
  isDocumentStagingKey,
} from './upload-key.js';

describe('createDocumentStorageKey', () => {
  it('namespaces the key by organization and document', () => {
    expect(createDocumentStorageKey('org-1', 'doc-1', 'token')).toBe(
      'organizations/org-1/documents/doc-1/token',
    );
  });

  it('is deterministic for the same token', () => {
    expect(createDocumentStorageKey('org-1', 'doc-1', 'token')).toBe(
      createDocumentStorageKey('org-1', 'doc-1', 'token'),
    );
  });

  it('separates documents and organizations', () => {
    expect(createDocumentStorageKey('org-1', 'doc-1', 'token')).not.toBe(
      createDocumentStorageKey('org-1', 'doc-2', 'token'),
    );
    expect(createDocumentStorageKey('org-1', 'doc-1', 'token')).not.toBe(
      createDocumentStorageKey('org-2', 'doc-1', 'token'),
    );
  });

  it('generates a fresh random suffix when no token is supplied', () => {
    const first = createDocumentStorageKey('org-1', 'doc-1');
    const second = createDocumentStorageKey('org-1', 'doc-1');

    expect(first).toMatch(
      /^organizations\/org-1\/documents\/doc-1\/[0-9a-f-]{36}$/,
    );
    expect(first).not.toBe(second);
  });
});

describe('createVerifiedStorageKey', () => {
  it('namespaces the verified key under the document', () => {
    expect(createVerifiedStorageKey('org-1', 'doc-1', 'token')).toBe(
      'organizations/org-1/documents/doc-1/verified/token',
    );
  });

  it('uses a fresh token by default and never collides with a staging key', () => {
    const verified = createVerifiedStorageKey('org-1', 'doc-1');

    expect(verified).toMatch(
      /^organizations\/org-1\/documents\/doc-1\/verified\/[0-9a-f-]{36}$/,
    );
    expect(verified).not.toBe(createDocumentStorageKey('org-1', 'doc-1'));
  });
});

describe('isDocumentStagingKey', () => {
  it('accepts a staging key for the same organization and document', () => {
    expect(
      isDocumentStagingKey(
        createDocumentStorageKey('org-1', 'doc-1', 'token'),
        'org-1',
        'doc-1',
      ),
    ).toBe(true);
  });

  it('rejects a key for another organization or document', () => {
    const key = createDocumentStorageKey('org-1', 'doc-1', 'token');

    expect(isDocumentStagingKey(key, 'org-2', 'doc-1')).toBe(false);
    expect(isDocumentStagingKey(key, 'org-1', 'doc-2')).toBe(false);
  });

  it('rejects a verified key, which is not client-writable staging', () => {
    const verified = createVerifiedStorageKey('org-1', 'doc-1', 'token');

    expect(isDocumentStagingKey(verified, 'org-1', 'doc-1')).toBe(false);
  });

  it('rejects keys with extra path segments or a missing token', () => {
    expect(
      isDocumentStagingKey(
        'organizations/org-1/documents/doc-1/../escape',
        'org-1',
        'doc-1',
      ),
    ).toBe(false);
    expect(
      isDocumentStagingKey('organizations/org-1/documents/doc-1/', 'org-1', 'doc-1'),
    ).toBe(false);
    expect(isDocumentStagingKey('', 'org-1', 'doc-1')).toBe(false);
  });
});
