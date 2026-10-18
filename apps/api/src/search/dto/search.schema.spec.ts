import { describe, expect, it } from 'vitest';
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  searchSchema,
} from './search.schema.js';

describe('searchSchema', () => {
  it('accepts a query and defaults the limit', () => {
    expect(searchSchema.parse({ q: '  hello  ' })).toEqual({
      q: 'hello',
      limit: SEARCH_DEFAULT_LIMIT,
    });
  });

  it('coerces a string limit to a number', () => {
    expect(searchSchema.parse({ q: 'hello', limit: '5' }).limit).toBe(5);
  });

  it('rejects a blank query', () => {
    expect(searchSchema.safeParse({ q: '   ' }).success).toBe(false);
  });

  it('rejects a query longer than the cap', () => {
    expect(searchSchema.safeParse({ q: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('rejects a limit outside the bounds', () => {
    expect(searchSchema.safeParse({ q: 'hello', limit: 0 }).success).toBe(false);
    expect(
      searchSchema.safeParse({ q: 'hello', limit: SEARCH_MAX_LIMIT + 1 }).success,
    ).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(
      searchSchema.safeParse({ q: 'hello', documentId: 'x' }).success,
    ).toBe(false);
  });
});
