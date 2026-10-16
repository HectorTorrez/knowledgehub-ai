import { describe, expect, it } from 'vitest';
import { createDocumentSchema } from './create-document.schema.js';

describe('createDocumentSchema', () => {
  it('accepts a valid title', () => {
    const parsed = createDocumentSchema.parse({ title: 'Quarterly report' });
    expect(parsed.title).toBe('Quarterly report');
  });

  it('trims surrounding whitespace', () => {
    const parsed = createDocumentSchema.parse({ title: '  Quarterly report  ' });
    expect(parsed.title).toBe('Quarterly report');
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(createDocumentSchema.safeParse({ title: '' }).success).toBe(false);
    expect(createDocumentSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a title longer than 200 characters', () => {
    expect(
      createDocumentSchema.safeParse({ title: 'a'.repeat(201) }).success,
    ).toBe(false);
  });

  it('accepts a title of exactly 200 characters', () => {
    expect(
      createDocumentSchema.safeParse({ title: 'a'.repeat(200) }).success,
    ).toBe(true);
  });

  it('rejects a missing or incorrectly typed title', () => {
    expect(createDocumentSchema.safeParse({}).success).toBe(false);
    expect(createDocumentSchema.safeParse({ title: 123 }).success).toBe(false);
    expect(createDocumentSchema.safeParse({ title: ['Doc'] }).success).toBe(
      false,
    );
    expect(createDocumentSchema.safeParse({ title: null }).success).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(
      createDocumentSchema.safeParse({ title: 'Doc', status: 'READY' }).success,
    ).toBe(false);
    expect(
      createDocumentSchema.safeParse({ title: 'Doc', organizationId: 'org-1' })
        .success,
    ).toBe(false);
    expect(
      createDocumentSchema.safeParse({ title: 'Doc', uploadedById: 'user-1' })
        .success,
    ).toBe(false);
  });
});
