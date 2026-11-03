import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';
import { assembleContext, renderSourceBlock } from './answer-context.js';
import { expandNeighbors, type NeighborChunk } from './neighbor-expansion.js';

const hit = (id: string, index: number, content: string, pageNumber = 1): RetrievedChunk => ({
  chunkId: id, documentId: 'doc', title: 'Title', pageNumber, chunkIndex: index,
  content, similarity: 0.9, relevance: 0.9, matchedLexically: false,
});
const row = (hitId: string, chunkId: string, chunkIndex: number, content: string, pageNumber = 1): NeighborChunk => ({
  hitId, chunkId, documentId: 'doc', documentGeneration: 1, pageNumber, chunkIndex, content,
});

describe('expandNeighbors', () => {
  it('deduplicates the longest overlap and separates text without overlap', () => {
    const result = expandNeighbors([hit('b', 1, 'abcdef')], [
      row('b', 'a', 0, 'start abc'), row('b', 'b', 1, 'abcdef'), row('b', 'c', 2, 'end'),
    ]);
    expect(result[0]!.content).toBe('start abcdef\nend');
  });

  it('deduplicates overlap across a newline', () => {
    const result = expandNeighbors([hit('b', 1, 'line\nnext')], [row('b', 'a', 0, 'first line\n'), row('b', 'b', 1, 'line\nnext')]);
    expect(result[0]!.content).toBe('first line\nnext');
  });

  it('merges adjacent hits and shared neighbors, retaining the best ranked citation and ordering', () => {
    const hits = [hit('b', 1, 'bc'), hit('x', 9, 'other'), hit('c', 2, 'cd')];
    const result = expandNeighbors(hits, [
      row('b', 'b', 1, 'bc'), row('b', 'c', 2, 'cd'),
      row('x', 'x', 9, 'other'), row('c', 'b', 1, 'bc'), row('c', 'c', 2, 'cd'),
    ]);
    expect(result.map((entry) => [entry.hit.chunkId, entry.content])).toEqual([['b', 'bcd'], ['x', 'other']]);
  });

  it('does not merge neighbors across page boundaries', () => {
    const hits = [hit('a', 0, 'first'), hit('b', 1, 'second', 2)];
    const result = expandNeighbors(hits, [row('a', 'a', 0, 'first'), row('a', 'b', 1, 'second', 2), row('b', 'a', 0, 'first'), row('b', 'b', 1, 'second', 2)]);
    expect(result.map((entry) => entry.content)).toEqual(['first', 'second']);
  });

  it('falls back to the original hit when the expanded source exceeds the budget', () => {
    const hits = [hit('a', 0, 'short')];
    const expanded = expandNeighbors(hits, [row('a', 'a', 0, 'short'), row('a', 'b', 1, 'a long neighbor')]);
    const source = { marker: 1, chunkId: 'a', documentId: 'doc', documentTitle: 'Title', pageNumber: 1, chunkIndex: 0, content: 'short', similarity: 0.9 };
    expect(assembleContext(hits, { maxSources: 1, maxChars: renderSourceBlock(source).length, minSimilarity: 0 }, expanded)).toEqual([source]);
  });
});
