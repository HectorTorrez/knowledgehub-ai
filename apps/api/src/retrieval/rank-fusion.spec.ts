import { describe, expect, it } from 'vitest';
import { fuseRanks } from './rank-fusion.js';

describe('fuseRanks', () => {
  it('combines ranks and records lexical matches', () => {
    const result = fuseRanks(
      [{ chunkId: 'a' }, { chunkId: 'b' }],
      [{ chunkId: 'b' }, { chunkId: 'c' }],
    );
    expect(result.map((item) => item.chunkId)).toEqual(['b', 'a', 'c']);
    expect(result[0]!.matchedLexically).toBe(true);
    expect(result[1]!.matchedLexically).toBe(false);
    expect(
      result.every((item) => item.relevance >= 0 && item.relevance <= 1),
    ).toBe(true);
  });
});
