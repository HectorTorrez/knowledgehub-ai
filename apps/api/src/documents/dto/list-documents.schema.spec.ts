import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LIST_DEFAULT_LIMIT,
  DOCUMENT_LIST_MAX_LIMIT,
  listDocumentsSchema,
} from './list-documents.schema.js';

describe('listDocumentsSchema', () => {
  it('defaults the limit and order when omitted', () => {
    expect(listDocumentsSchema.parse({})).toEqual({
      limit: DOCUMENT_LIST_DEFAULT_LIMIT,
      order: 'createdAt_desc',
    });
  });

  it('coerces a string limit to a number', () => {
    expect(listDocumentsSchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('accepts an optional cursor', () => {
    const parsed = listDocumentsSchema.parse({ cursor: 'opaque' });
    expect(parsed.cursor).toBe('opaque');
  });

  it('accepts an optional title query', () => {
    expect(listDocumentsSchema.parse({ q: 'handbook' }).q).toBe('handbook');
  });

  it('trims the title query and rejects an empty one', () => {
    expect(listDocumentsSchema.parse({ q: '  handbook  ' }).q).toBe('handbook');
    expect(listDocumentsSchema.safeParse({ q: '   ' }).success).toBe(false);
  });

  it('accepts each document status filter', () => {
    for (const status of ['PENDING', 'PROCESSING', 'READY', 'FAILED']) {
      expect(listDocumentsSchema.parse({ status }).status).toBe(status);
    }
  });

  it('rejects an unknown status filter', () => {
    expect(listDocumentsSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });

  it('accepts both sort orders and rejects an unknown one', () => {
    expect(listDocumentsSchema.parse({ order: 'createdAt_asc' }).order).toBe('createdAt_asc');
    expect(listDocumentsSchema.safeParse({ order: 'title' }).success).toBe(false);
  });

  it('rejects a limit below 1', () => {
    expect(listDocumentsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listDocumentsSchema.safeParse({ limit: -1 }).success).toBe(false);
  });

  it('rejects a limit above the cap', () => {
    expect(
      listDocumentsSchema.safeParse({ limit: DOCUMENT_LIST_MAX_LIMIT + 1 })
        .success,
    ).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(listDocumentsSchema.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it('rejects an empty cursor', () => {
    expect(listDocumentsSchema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(
      listDocumentsSchema.safeParse({ limit: 10, page: 2 }).success,
    ).toBe(false);
  });
});
