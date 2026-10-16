import { describe, expect, it } from 'vitest';
import { createDocumentStorageKey } from './upload-key.js';

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
