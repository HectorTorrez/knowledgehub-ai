import { describe, expect, it } from 'vitest';
import { summaryInput } from './summary-input.js';

describe('summaryInput', () => {
  it('removes overlap within pages', () => {
    expect(summaryInput([{ chunkIndex: 0, pageNumber: 1, content: 'abcdef' }, { chunkIndex: 1, pageNumber: 1, content: 'defghi' }], 100)).toBe('abcdefghi');
  });
  it('keeps the beginning and samples the end within the budget', () => {
    const text = 'a'.repeat(100) + 'b'.repeat(100) + 'c'.repeat(100);
    const result = summaryInput([{ chunkIndex: 0, pageNumber: 1, content: text }], 40);
    expect(result).toHaveLength(40);
    expect(result.startsWith('a'.repeat(20))).toBe(true);
    expect(result.endsWith('c')).toBe(true);
  });
});
