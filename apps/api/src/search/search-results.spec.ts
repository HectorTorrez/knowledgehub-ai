import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';
import { createSearchMatch, groupSearchResults } from './search-results.js';

const chunk: RetrievedChunk = {
  chunkId: '1', documentId: 'a', title: 'A', pageNumber: 1, chunkIndex: 0,
  content: 'El niño tomó café, CAFÉ y piñata.', similarity: 0.8, relevance: 0.8, matchedLexically: true,
};

describe('search results', () => {
  it('highlights accent-insensitive terms with original offsets', () => {
    const match = createSearchMatch(chunk, 'NINO cafe, piñata café');
    expect(match.highlights.map(({ start, end }) => match.excerpt.slice(start, end))).toEqual(['niño', 'café', 'CAFÉ', 'piñata']);
  });
  it('groups, ranks, counts and removes heavily overlapping adjacent chunks', () => {
    const results = groupSearchResults([
      { ...chunk, content: 'abcdefghij', relevance: 0.9 },
      { ...chunk, chunkId: '2', chunkIndex: 1, content: 'fghijklmno' },
      { ...chunk, chunkId: '3', documentId: 'b', relevance: 0.7 },
    ], 'cafe', 2);
    expect(results.map(({ documentId, matchCount, matches }) => [documentId, matchCount, matches.length])).toEqual([['a', 2, 1], ['b', 1, 1]]);
  });
});
