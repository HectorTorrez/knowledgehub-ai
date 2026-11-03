import { describe, expect, it } from 'vitest';
import { renderSourcesSection } from './answer-context.js';
import { wholeDocumentContext } from './whole-document-context.js';

const budget = { maxSources: 2, maxChars: 1000, minSimilarity: 0 };
const chunk = (pageNumber: number, chunkIndex: number, content: string) => ({
  chunkId: `${chunkIndex}`, documentId: 'doc', documentTitle: 'Title', pageNumber, chunkIndex, content,
});

describe('wholeDocumentContext', () => {
  it('orders pages and reconstructs overlapping chunks with the first chunk as citation', () => {
    const result = wholeDocumentContext([chunk(2, 2, 'second'), chunk(1, 1, 'world!'), chunk(1, 0, 'hello world')], budget);
    expect(result?.map(({ pageNumber, chunkId, content }) => ({ pageNumber, chunkId, content }))).toEqual([
      { pageNumber: 1, chunkId: '0', content: 'hello world!' },
      { pageNumber: 2, chunkId: '2', content: 'second' },
    ]);
  });
  it('reconstructs overlap spanning a newline', () => {
    expect(wholeDocumentContext([chunk(1, 0, 'first line\n'), chunk(1, 1, 'line\nnext')], budget)?.[0]?.content).toBe('first line\nnext');
  });
  it('falls back for empty documents, excess pages, and excess rendered characters', () => {
    expect(wholeDocumentContext([], budget)).toBeNull();
    expect(wholeDocumentContext([chunk(1, 0, 'a'), chunk(2, 1, 'b'), chunk(3, 2, 'c')], budget)).toBeNull();
    expect(wholeDocumentContext([chunk(1, 0, '&')], { ...budget, maxChars: 1 })).toBeNull();
  });
  it('accepts an exact rendered budget and joins nonoverlapping chunks', () => {
    const chunks = [chunk(1, 0, 'abc'), chunk(1, 1, 'xyz')];
    const result = wholeDocumentContext(chunks, budget)!;
    expect(result[0].content).toBe('abc\nxyz');
    expect(wholeDocumentContext(chunks, { ...budget, maxChars: renderSourcesSection(result).length })).not.toBeNull();
  });
});
