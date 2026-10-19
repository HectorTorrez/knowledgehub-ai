import { describe, expect, it } from 'vitest';
import type { AnswerSource } from './answer-context.js';
import {
  buildCitations,
  buildExcerpt,
  validateAnswerContract,
} from './answer-citation.js';

function source(
  marker: number,
  overrides: Partial<AnswerSource> = {},
): AnswerSource {
  return {
    marker,
    chunkId: `chunk-${marker}`,
    documentId: `doc-${marker}`,
    documentTitle: `Document ${marker}`,
    pageNumber: marker,
    chunkIndex: 0,
    content: `Content ${marker}`,
    similarity: 0.9,
    ...overrides,
  };
}

describe('buildExcerpt', () => {
  it('returns short content unchanged', () => {
    expect(buildExcerpt('Alpha beta.')).toBe('Alpha beta.');
  });

  it('collapses whitespace', () => {
    expect(buildExcerpt('Alpha\n\n  beta\tgamma')).toBe('Alpha beta gamma');
  });

  it('truncates long content within the limit and marks the cut', () => {
    const excerpt = buildExcerpt('a'.repeat(500), 20);

    expect(excerpt).toHaveLength(20);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('never exceeds the limit when trailing whitespace precedes the cut', () => {
    const excerpt = buildExcerpt(`${'a'.repeat(10)}   ${'b'.repeat(50)}`, 15);

    expect(excerpt.length).toBeLessThanOrEqual(15);
  });
});

describe('buildCitations', () => {
  const sources = [source(1), source(2), source(3)];

  it('maps markers to sources in ascending order', () => {
    expect(buildCitations([3, 1, 3], sources)).toEqual([
      {
        marker: 1,
        documentId: 'doc-1',
        documentTitle: 'Document 1',
        pageNumber: 1,
        chunkIndex: 0,
        excerpt: 'Content 1',
      },
      {
        marker: 3,
        documentId: 'doc-3',
        documentTitle: 'Document 3',
        pageNumber: 3,
        chunkIndex: 0,
        excerpt: 'Content 3',
      },
    ]);
  });

  it('only ever derives citations from the provided sources', () => {
    expect(buildCitations([1, 9], sources)).toHaveLength(1);
  });

  it('derives the excerpt from the cited chunk, capped by the limit', () => {
    const long = [source(1, { content: 'x'.repeat(400) })];

    const [citation] = buildCitations([1], long, 50);

    expect(citation?.excerpt).toHaveLength(50);
  });
});

describe('validateAnswerContract', () => {
  const sources = [source(1), source(2)];

  it('renders an answered response from its claims and derives the markers', () => {
    expect(
      validateAnswerContract(
        {
          status: 'answered',
          claims: [
            { text: 'Bounded retries.', source: 1 },
            { text: 'Leases are time-limited.', source: 2 },
          ],
        },
        sources,
      ),
    ).toEqual({
      ok: true,
      status: 'answered',
      answer: 'Bounded retries [1]. Leases are time-limited [2].',
      markers: [1, 2],
    });
  });

  it('appends the marker when a claim has no sentence punctuation', () => {
    const result = validateAnswerContract(
      {
        status: 'answered',
        claims: [{ text: 'torrezhectorb@gmail.com', source: 1 }],
      },
      sources,
    );

    expect(result).toMatchObject({ answer: 'torrezhectorb@gmail.com [1]' });
  });

  it('de-duplicates repeated markers in the accepted response', () => {
    const result = validateAnswerContract(
      {
        status: 'answered',
        claims: [
          { text: 'First.', source: 1 },
          { text: 'Again.', source: 1 },
        ],
      },
      sources,
    );

    expect(result).toMatchObject({ ok: true, markers: [1] });
  });

  it('drops a repeated sentence while keeping its first source', () => {
    const result = validateAnswerContract(
      {
        status: 'answered',
        claims: [
          { text: 'The same sentence.', source: 1 },
          { text: 'The same sentence.', source: 2 },
        ],
      },
      sources,
    );

    expect(result).toEqual({
      ok: true,
      status: 'answered',
      answer: 'The same sentence [1].',
      markers: [1],
    });
  });

  it('trims claim text before rendering', () => {
    const result = validateAnswerContract(
      { status: 'answered', claims: [{ text: '  Alpha.  ', source: 1 }] },
      sources,
    );

    expect(result).toMatchObject({ answer: 'Alpha [1].' });
  });

  it('accepts a refusal that carries no claims', () => {
    expect(
      validateAnswerContract(
        { status: 'insufficient_evidence', claims: null },
        sources,
      ),
    ).toEqual({ ok: true, status: 'insufficient_evidence' });
  });

  it.each([null, 'answered', 42, ['answered']])(
    'fails closed when the payload is not an object: %j',
    (value) => {
      expect(validateAnswerContract(value, sources)).toMatchObject({
        ok: false,
        violation: { reason: 'NOT_AN_OBJECT' },
      });
    },
  );

  it('fails closed on a missing field', () => {
    expect(
      validateAnswerContract({ status: 'answered' }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'UNEXPECTED_FIELDS' } });
  });

  it('fails closed on an unexpected field', () => {
    expect(
      validateAnswerContract(
        {
          status: 'answered',
          claims: [{ text: 'Alpha.', source: 1 }],
          extra: true,
        },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'UNEXPECTED_FIELDS' } });
  });

  it('fails closed on an unexpected status', () => {
    expect(
      validateAnswerContract({ status: 'maybe', claims: null }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'UNEXPECTED_STATUS' } });
  });

  it.each([null, 'Alpha.', 42])(
    'fails closed when an answered response carries no claim list: %j',
    (claims) => {
      expect(
        validateAnswerContract({ status: 'answered', claims }, sources),
      ).toMatchObject({ ok: false, violation: { reason: 'NO_CLAIMS' } });
    },
  );

  it('fails closed when an answered response carries an empty claim list', () => {
    expect(
      validateAnswerContract({ status: 'answered', claims: [] }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'NO_CLAIMS' } });
  });

  it('fails closed on a claim that is not an object', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', claims: ['Alpha.'] },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'INVALID_CLAIM' } });
  });

  it.each([
    ['a non-string text', { text: 42, source: 1 }],
    ['a blank text', { text: '   ', source: 1 }],
  ])('fails closed on %s', (_label, claim) => {
    expect(
      validateAnswerContract({ status: 'answered', claims: [claim] }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'INVALID_CLAIM_TEXT' } });
  });

  it.each([
    ['a missing source', { text: 'Alpha.' }],
    ['a non-integer source', { text: 'Alpha.', source: 1.5 }],
    ['a string source', { text: 'Alpha.', source: '1' }],
  ])('fails closed on %s', (_label, claim) => {
    expect(
      validateAnswerContract({ status: 'answered', claims: [claim] }, sources),
    ).toMatchObject({
      ok: false,
      violation: { reason: 'INVALID_CLAIM_SOURCE' },
    });
  });

  it('fails closed when a claim references a source that was not provided', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', claims: [{ text: 'Alpha.', source: 9 }] },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'UNKNOWN_SOURCE' } });

    expect(
      validateAnswerContract(
        { status: 'answered', claims: [{ text: 'Alpha.', source: 0 }] },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'UNKNOWN_SOURCE' } });
  });

  it('fails closed when a refusal carries claims', () => {
    expect(
      validateAnswerContract(
        {
          status: 'insufficient_evidence',
          claims: [{ text: 'I do not know.', source: 1 }],
        },
        sources,
      ),
    ).toMatchObject({
      ok: false,
      violation: { reason: 'REFUSAL_WITH_CLAIMS' },
    });
  });

  it('accepts a valid source even when the cited passage does not support the claim', () => {
    const result = validateAnswerContract(
      {
        status: 'answered',
        claims: [{ text: 'Revenue grew 40% last quarter.', source: 1 }],
      },
      [source(1, { content: 'The office is closed on Mondays.' })],
    );

    expect(result).toEqual({
      ok: true,
      status: 'answered',
      answer: 'Revenue grew 40% last quarter [1].',
      markers: [1],
    });
  });
});
