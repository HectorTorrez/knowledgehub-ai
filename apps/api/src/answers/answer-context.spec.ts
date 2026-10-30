import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';
import {
  assembleContext,
  renderSourceBlock,
  renderSourcesSection,
  type AnswerSource,
  type ContextBudget,
} from './answer-context.js';

function retrievedChunk(
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    title: 'Report',
    pageNumber: 1,
    chunkIndex: 0,
    content: 'alpha',
    similarity: 0.9,
    lexicalMatch: false,
    ...overrides,
  };
}

function blockOf(marker: number, content: string): number {
  return renderSourceBlock({
    marker,
    chunkId: `chunk-${marker}`,
    documentId: `doc-${marker}`,
    documentTitle: 'Report',
    pageNumber: 1,
    chunkIndex: 0,
    content,
    similarity: 1,
  }).length;
}

const GENEROUS_BUDGET: ContextBudget = {
  maxSources: 8,
  maxChars: 100_000,
  minSimilarity: 0,
};

describe('assembleContext', () => {
  it('preserves retrieval order and numbers sources from one', () => {
    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'c1', documentId: 'd1', similarity: 0.9 }),
        retrievedChunk({
          chunkId: 'c2',
          documentId: 'd2',
          title: 'Handbook',
          pageNumber: 4,
          chunkIndex: 2,
          content: 'beta',
          similarity: 0.7,
        }),
      ],
      GENEROUS_BUDGET,
    );

    expect(sources).toEqual([
      {
        marker: 1,
        chunkId: 'c1',
        documentId: 'd1',
        documentTitle: 'Report',
        pageNumber: 1,
        chunkIndex: 0,
        content: 'alpha',
        similarity: 0.9,
      },
      {
        marker: 2,
        chunkId: 'c2',
        documentId: 'd2',
        documentTitle: 'Handbook',
        pageNumber: 4,
        chunkIndex: 2,
        content: 'beta',
        similarity: 0.7,
      },
    ]);
  });

  it('drops chunks below the similarity floor and numbers the survivors', () => {
    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'weak', similarity: 0.1 }),
        retrievedChunk({ chunkId: 'strong', similarity: 0.5 }),
      ],
      { ...GENEROUS_BUDGET, minSimilarity: 0.2 },
    );

    expect(sources.map((source) => source.chunkId)).toEqual(['strong']);
    expect(sources.map((source) => source.marker)).toEqual([1]);
  });

  it('keeps lexical matches below the similarity floor', () => {
    const sources = assembleContext(
      [retrievedChunk({ similarity: 0.1, lexicalMatch: true })],
      { ...GENEROUS_BUDGET, minSimilarity: 0.2 },
    );
    expect(sources).toHaveLength(1);
  });

  it('keeps a chunk whose similarity equals the floor', () => {
    const sources = assembleContext([retrievedChunk({ similarity: 0.2 })], {
      ...GENEROUS_BUDGET,
      minSimilarity: 0.2,
    });

    expect(sources).toHaveLength(1);
  });

  it('never exceeds the source cap', () => {
    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'c1' }),
        retrievedChunk({ chunkId: 'c2' }),
        retrievedChunk({ chunkId: 'c3' }),
      ],
      { ...GENEROUS_BUDGET, maxSources: 2 },
    );

    expect(sources.map((source) => source.chunkId)).toEqual(['c1', 'c2']);
    expect(sources.map((source) => source.marker)).toEqual([1, 2]);
  });

  it('includes only whole chunks that fit the remaining budget', () => {
    const first = 'a'.repeat(50);
    const second = 'b'.repeat(5);
    const third = 'c'.repeat(5);

    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'c1', content: first }),
        retrievedChunk({ chunkId: 'c2', content: second }),
        retrievedChunk({ chunkId: 'c3', content: third }),
      ],
      {
        ...GENEROUS_BUDGET,
        maxChars: blockOf(1, first) + 2 + blockOf(2, second),
      },
    );

    expect(sources.map((source) => source.chunkId)).toEqual(['c1', 'c2']);
    expect(sources.map((source) => source.content)).toEqual([first, second]);
  });

  it('skips an oversized chunk without leaving a gap in the numbering', () => {
    const small = 'a'.repeat(5);
    const huge = 'x'.repeat(5_000);
    const later = 'c'.repeat(5);

    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'c1', content: small }),
        retrievedChunk({ chunkId: 'c2', content: huge }),
        retrievedChunk({ chunkId: 'c3', content: later }),
      ],
      {
        ...GENEROUS_BUDGET,
        maxChars: blockOf(1, small) + 2 + blockOf(2, later),
      },
    );

    expect(sources.map((source) => source.chunkId)).toEqual(['c1', 'c3']);
    expect(sources.map((source) => source.marker)).toEqual([1, 2]);
  });

  it('returns nothing when the budget admits no whole chunk', () => {
    const sources = assembleContext(
      [retrievedChunk({ content: 'a'.repeat(100) })],
      { ...GENEROUS_BUDGET, maxChars: 10 },
    );

    expect(sources).toEqual([]);
  });

  it('renders exactly within the character budget', () => {
    const first = 'a'.repeat(50);
    const second = 'b'.repeat(5);
    const limit = blockOf(1, first) + 2 + blockOf(2, second);

    const sources = assembleContext(
      [
        retrievedChunk({ chunkId: 'c1', content: first }),
        retrievedChunk({ chunkId: 'c2', content: second }),
      ],
      { ...GENEROUS_BUDGET, maxChars: limit },
    );

    expect(renderSourcesSection(sources)).toHaveLength(limit);
  });

  it('is deterministic for the same input', () => {
    const chunks = [
      retrievedChunk({ chunkId: 'c1' }),
      retrievedChunk({ chunkId: 'c2', content: 'beta' }),
    ];

    expect(assembleContext(chunks, GENEROUS_BUDGET)).toEqual(
      assembleContext(chunks, GENEROUS_BUDGET),
    );
  });
});

describe('renderSourceBlock', () => {
  const source: AnswerSource = {
    marker: 3,
    chunkId: 'chunk-3',
    documentId: 'doc-3',
    documentTitle: 'Report',
    pageNumber: 2,
    chunkIndex: 0,
    content: 'Alpha beta.',
    similarity: 0.9,
  };

  it('renders the marker, title, page and content', () => {
    expect(renderSourceBlock(source)).toBe(
      '<source id="3" title="Report" page="2">\nAlpha beta.\n</source>',
    );
  });

  it('escapes markup in the title and content', () => {
    expect(
      renderSourceBlock({
        ...source,
        documentTitle: 'A & B <c>',
        content: '<script>&</script>',
      }),
    ).toBe(
      '<source id="3" title="A &amp; B &lt;c&gt;" page="2">\n&lt;script&gt;&amp;&lt;/script&gt;\n</source>',
    );
  });

  it('escapes quotes so they cannot break the attribute', () => {
    expect(
      renderSourceBlock({ ...source, documentTitle: 'A "quoted" title' }),
    ).toContain('title="A &quot;quoted&quot; title"');
  });

  it('joins multiple sources with a blank line', () => {
    const section = renderSourcesSection([
      source,
      { ...source, marker: 4, content: 'Gamma.' },
    ]);

    expect(section).toBe(
      `${renderSourceBlock(source)}\n\n${renderSourceBlock({ ...source, marker: 4, content: 'Gamma.' })}`,
    );
  });
});
