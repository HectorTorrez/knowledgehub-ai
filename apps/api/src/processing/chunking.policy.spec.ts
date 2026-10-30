import { describe, expect, it } from 'vitest';
import {
  CHUNK_TARGET_CHARACTERS,
  ChunkLimitExceededError,
  chunkEmbeddingInput,
  chunkPages,
  MAX_CHUNKS_PER_GENERATION,
} from './chunking.policy.js';

describe('chunkPages', () => {
  it('keeps a short page as a single chunk', () => {
    expect(chunkPages([{ pageNumber: 1, content: 'A short page.' }])).toEqual([
      {
        pageNumber: 1,
        chunkIndex: 0,
        content: 'A short page.',
        characterCount: 13,
      },
    ]);
  });

  it('never lets a chunk span two pages', () => {
    const chunks = chunkPages([
      { pageNumber: 1, content: 'First page text.' },
      { pageNumber: 2, content: 'Second page text.' },
    ]);

    expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([1, 2]);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
    expect(chunks[0]?.content).toBe('First page text.');
    expect(chunks[1]?.content).toBe('Second page text.');
  });

  it('overlaps consecutive chunks within a page', () => {
    const chunks = chunkPages([
      { pageNumber: 1, content: 'word '.repeat(1_000) },
    ]);

    expect(chunks.length).toBeGreaterThan(1);

    const [first, second] = chunks;
    expect(second?.content.slice(0, 100)).toBeTruthy();
    expect(first?.content).toContain(second!.content.slice(0, 100));
  });

  it('splits on word boundaries without leaving partial words', () => {
    const chunks = chunkPages([
      { pageNumber: 1, content: 'word '.repeat(1_000) },
    ]);

    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/^word(?: word)*$/);
    }
  });

  it('prefers paragraph and sentence boundaries', () => {
    const paragraph = 'a'.repeat(900);
    const chunks = chunkPages([{ pageNumber: 1, content: `${paragraph}\n\n${'b'.repeat(900)}` }]);
    expect(chunks[0]?.content).toBe(paragraph);
    const sentences = chunkPages([{ pageNumber: 1, content: `${'a'.repeat(900)}. ${'b'.repeat(900)}` }]);
    expect(sentences[0]?.content).toBe(`${'a'.repeat(900)}.`);
  });

  it('hard-splits a whitespace-free run at the target length', () => {
    const chunks = chunkPages([{ pageNumber: 1, content: 'x'.repeat(4_000) }]);

    expect(chunks[0]?.characterCount).toBe(CHUNK_TARGET_CHARACTERS);
    for (const chunk of chunks) {
      expect(chunk.characterCount).toBeLessThanOrEqual(CHUNK_TARGET_CHARACTERS);
    }
  });

  it('normalizes whitespace within a page', () => {
    const chunks = chunkPages([
      { pageNumber: 1, content: 'a\n\n   b\tc' },
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('a\n\nb c');
  });

  it('produces no chunk for a whitespace-only page', () => {
    expect(
      chunkPages([{ pageNumber: 1, content: '   \n\t ' }]),
    ).toEqual([]);
  });

  it('is deterministic for the same input', () => {
    const pages = [{ pageNumber: 1, content: 'word '.repeat(500) }];

    expect(chunkPages(pages)).toEqual(chunkPages(pages));
  });

  it('rejects a document that exceeds the chunk budget', () => {
    const pages = Array.from(
      { length: MAX_CHUNKS_PER_GENERATION + 1 },
      (_, index) => ({ pageNumber: index + 1, content: 'word' }),
    );

    expect(() => chunkPages(pages)).toThrow(ChunkLimitExceededError);
  });
});

describe('chunkEmbeddingInput', () => {
  it('prefixes the chunk with its document title and page', () => {
    expect(
      chunkEmbeddingInput('Lease', { pageNumber: 3, content: 'Rent is due.' }),
    ).toBe('Lease — page 3\nRent is due.');
  });
});
