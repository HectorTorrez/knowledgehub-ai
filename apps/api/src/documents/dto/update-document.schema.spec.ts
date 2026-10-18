import { describe, expect, it } from 'vitest';
import { updateDocumentSchema } from './update-document.schema.js';

describe('updateDocumentSchema', () => {
  it('accepts and trims a valid title', () => {
    const parsed = updateDocumentSchema.parse({ title: '  New title  ' });
    expect(parsed.title).toBe('New title');
  });

  it('rejects an empty title', () => {
    expect(updateDocumentSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a title longer than 200 characters', () => {
    expect(
      updateDocumentSchema.safeParse({ title: 'a'.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects a missing title', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(
      updateDocumentSchema.safeParse({ title: 'Doc', status: 'READY' }).success,
    ).toBe(false);
  });
});
