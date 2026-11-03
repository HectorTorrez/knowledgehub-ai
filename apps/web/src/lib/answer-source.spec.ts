import { describe, expect, it } from 'vitest';
import { passageSearch } from './answer-source';

describe('passageSearch', () => {
  it('preserves the page and quoted passage for navigation', () => {
    expect(passageSearch(3, 'A passage & more')).toEqual({ page: 3, quote: 'A passage & more' });
  });
});
