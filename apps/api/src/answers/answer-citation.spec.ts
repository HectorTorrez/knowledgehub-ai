import { describe, expect, it } from 'vitest';
import type { AnswerSource } from './answer-context.js';
import {
  buildCitations,
  buildExcerpt,
  parseCitationMarkers,
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

describe('parseCitationMarkers', () => {
  it('extracts a single marker', () => {
    expect(parseCitationMarkers('Retries are bounded [1].')).toEqual({
      markers: [1],
      malformed: [],
    });
  });

  it('de-duplicates repeated markers and sorts ascending', () => {
    expect(parseCitationMarkers('[2] and [1] and [2]').markers).toEqual([1, 2]);
  });

  it('ignores brackets that contain no digits', () => {
    expect(parseCitationMarkers('[note] [] [draft]')).toEqual({
      markers: [],
      malformed: [],
    });
  });

  it('flags a comma-separated marker as malformed', () => {
    expect(parseCitationMarkers('See [1, 2].')).toEqual({
      markers: [],
      malformed: ['[1, 2]'],
    });
  });

  it('flags a range marker as malformed', () => {
    expect(parseCitationMarkers('See [1-3].')).toEqual({
      markers: [],
      malformed: ['[1-3]'],
    });
  });

  it('flags a mixed marker as malformed', () => {
    expect(parseCitationMarkers('See [1a].')).toEqual({
      markers: [],
      malformed: ['[1a]'],
    });
  });

  it('flags a padded marker as malformed', () => {
    expect(parseCitationMarkers('See [ 1 ].')).toEqual({
      markers: [],
      malformed: ['[ 1 ]'],
    });
  });

  it('flags an unclosed marker as malformed', () => {
    expect(parseCitationMarkers('See [1')).toEqual({
      markers: [],
      malformed: ['[1]'],
    });
  });

  it('accepts a zero-padded marker as the number it denotes', () => {
    expect(parseCitationMarkers('See [01].').markers).toEqual([1]);
  });
});

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

  it('accepts a grounded answered response', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', answer: 'Bounded retries [1] and leases [2].' },
        sources,
      ),
    ).toEqual({
      ok: true,
      status: 'answered',
      answer: 'Bounded retries [1] and leases [2].',
      markers: [1, 2],
    });
  });

  it('de-duplicates repeated markers in the accepted response', () => {
    const result = validateAnswerContract(
      { status: 'answered', answer: 'First [1] then again [1].' },
      sources,
    );

    expect(result).toMatchObject({ ok: true, markers: [1] });
  });

  it('accepts a refusal that carries no answer', () => {
    expect(
      validateAnswerContract(
        { status: 'insufficient_evidence', answer: null },
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
    expect(validateAnswerContract({ status: 'answered' }, sources)).toMatchObject(
      { ok: false, violation: { reason: 'UNEXPECTED_FIELDS' } },
    );
  });

  it('fails closed on an unexpected field', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', answer: 'Alpha [1]', extra: true },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'UNEXPECTED_FIELDS' } });
  });

  it('fails closed on an unexpected status', () => {
    expect(
      validateAnswerContract({ status: 'maybe', answer: 'Alpha [1]' }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'UNEXPECTED_STATUS' } });
  });

  it('fails closed when an answered response carries no string answer', () => {
    expect(
      validateAnswerContract({ status: 'answered', answer: null }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'INVALID_ANSWER_TYPE' } });
  });

  it('fails closed on an empty answer', () => {
    expect(
      validateAnswerContract({ status: 'answered', answer: '   ' }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'EMPTY_ANSWER' } });
  });

  it('fails closed when an answered response cites nothing', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', answer: 'No citation here.' },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'NO_CITATIONS' } });
  });

  it('fails closed on a malformed marker instead of dropping it', () => {
    expect(
      validateAnswerContract(
        { status: 'answered', answer: 'Alpha [1, 2]' },
        sources,
      ),
    ).toMatchObject({ ok: false, violation: { reason: 'MALFORMED_MARKER' } });
  });

  it('fails closed when a marker references a source that was not provided', () => {
    expect(
      validateAnswerContract({ status: 'answered', answer: 'Alpha [9]' }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'UNKNOWN_SOURCE' } });

    expect(
      validateAnswerContract({ status: 'answered', answer: 'Alpha [0]' }, sources),
    ).toMatchObject({ ok: false, violation: { reason: 'UNKNOWN_SOURCE' } });
  });

  it('fails closed when a refusal carries answer prose', () => {
    expect(
      validateAnswerContract(
        { status: 'insufficient_evidence', answer: 'I do not know.' },
        sources,
      ),
    ).toMatchObject({
      ok: false,
      violation: { reason: 'REFUSAL_WITH_ANSWER' },
    });
  });

  it('accepts a valid marker even when the cited passage does not support the claim', () => {
    const result = validateAnswerContract(
      {
        status: 'answered',
        answer: 'Revenue grew 40% last quarter [1].',
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
