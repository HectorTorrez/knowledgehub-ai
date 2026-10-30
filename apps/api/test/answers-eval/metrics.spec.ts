import { describe, expect, it } from 'vitest';
import { chunkPages } from '../../src/processing/chunking.policy.js';
import { EVAL_CORPUS } from './corpus.js';
import {
  computeMetrics,
  percentile,
  scoreOutcome,
  type QuestionOutcome,
} from './metrics.js';

const DOC_A = { documentTitle: 'Doc A', pageNumber: 1 };
const DOC_B = { documentTitle: 'Doc B', pageNumber: 2 };

function outcome(
  overrides: Partial<QuestionOutcome> & Pick<QuestionOutcome, 'id'>,
): QuestionOutcome {
  return {
    kind: 'single_source',
    status: 'answered',
    citations: [],
    expected: [],
    supporting: [],
    answer: null,
    violation: null,
    latencyMs: 100,
    inputTokens: null,
    outputTokens: null,
    ...overrides,
  };
}

describe('computeMetrics', () => {
  it('reports perfect scores when every answer is exact and every unanswerable question refuses', () => {
    const metrics = computeMetrics([
      outcome({
        id: 'answered',
        citations: [DOC_A],
        expected: [DOC_A],
        supporting: [DOC_A],
      }),
      outcome({ id: 'unanswerable', status: 'insufficient_evidence' }),
    ]);

    expect(metrics.citationPrecision).toBe(1);
    expect(metrics.citationRecall).toBe(1);
    expect(metrics.exactMatchRate).toBe(1);
    expect(metrics.groundingHitRate).toBe(1);
    expect(metrics.structuralIntegrity).toBe(1);
    expect(metrics.refusalAccuracy).toBe(1);
    expect(metrics.falseRefusalRate).toBe(0);
  });

  it('scores calculation answers and includes refusals in the denominator', () => {
    const metrics = computeMetrics([
      outcome({
        id: 'correct', kind: 'calculation', expectedValue: '$100.00',
        answer: 'The sum is $100.00.',
      }),
      outcome({
        id: 'wrong', kind: 'calculation', expectedValue: '$100.00',
        answer: 'The sum is $10.00.',
      }),
      outcome({
        id: 'refused', kind: 'calculation', expectedValue: '5',
        status: 'insufficient_evidence',
      }),
      outcome({ id: 'other', answer: '$100.00' }),
    ]);

    expect(metrics.calculationAccuracy).toBe(1 / 3);
    expect(computeMetrics([]).calculationAccuracy).toBeNull();
  });

  it('scores partial citation coverage', () => {
    const metrics = computeMetrics([
      outcome({
        id: 'partial',
        citations: [DOC_A],
        expected: [DOC_A, DOC_B],
        supporting: [DOC_A, DOC_B],
      }),
    ]);

    expect(metrics.citationPrecision).toBe(1);
    expect(metrics.citationRecall).toBe(0.5);
    expect(metrics.exactMatchRate).toBe(0);
    expect(metrics.groundingHitRate).toBe(1);
  });

  it('penalizes citations that were not expected', () => {
    const metrics = computeMetrics([
      outcome({
        id: 'extra',
        citations: [DOC_A, DOC_B],
        expected: [DOC_A],
        supporting: [DOC_A],
      }),
    ]);

    expect(metrics.citationPrecision).toBe(0.5);
    expect(metrics.citationRecall).toBe(1);
    expect(metrics.exactMatchRate).toBe(0);
  });

  it('counts a refusal on an answerable question as a false refusal', () => {
    const metrics = computeMetrics([
      outcome({
        id: 'refused',
        status: 'insufficient_evidence',
        expected: [DOC_A],
        supporting: [DOC_A],
      }),
    ]);

    expect(metrics.citationRecall).toBe(0);
    expect(metrics.falseRefusalRate).toBe(1);
    expect(metrics.citationPrecision).toBeNull();
  });

  it('counts an answer to an unanswerable question as a refusal failure', () => {
    const metrics = computeMetrics([
      outcome({ id: 'false-answer', citations: [DOC_A] }),
    ]);

    expect(metrics.refusalAccuracy).toBe(0);
  });

  it('reduces structural integrity for a violation', () => {
    const metrics = computeMetrics([
      outcome({ id: 'ok' }),
      outcome({ id: 'bad', status: 'error', violation: 'BadGatewayException' }),
    ]);

    expect(metrics.structuralIntegrity).toBe(0.5);
  });

  it('scores document hits across pages and includes refusals and errors', () => {
    const metrics = computeMetrics([
      outcome({ id: 'hit', expected: [DOC_A], citations: [{ ...DOC_A, pageNumber: 9 }] }),
      outcome({ id: 'miss', expected: [DOC_A], citations: [DOC_B] }),
      outcome({ id: 'refused', expected: [DOC_A], status: 'insufficient_evidence' }),
      outcome({ id: 'error', expected: [DOC_A], status: 'error' }),
      outcome({ id: 'unanswerable' }),
    ]);
    expect(metrics.documentHitRate).toBe(0.25);
    expect(computeMetrics([]).documentHitRate).toBeNull();
  });

  it('aggregates latency and token usage', () => {
    const metrics = computeMetrics([
      outcome({ id: 'a', latencyMs: 100, inputTokens: 10, outputTokens: 5 }),
      outcome({ id: 'b', latencyMs: 300, inputTokens: 20, outputTokens: 7 }),
      outcome({ id: 'c', latencyMs: 200 }),
    ]);

    expect(metrics.latencyP50Ms).toBe(200);
    expect(metrics.inputTokens).toBe(30);
    expect(metrics.outputTokens).toBe(12);
    expect(metrics.tokenReports).toBe(2);
  });
});

describe('scoreOutcome', () => {
  it('returns nulls when precision, recall, or grounding have no basis', () => {
    expect(
      scoreOutcome(outcome({ id: 'empty' })),
    ).toEqual({ precision: null, recall: null, groundingHit: null, documentHit: null });
  });

  it('marks a grounding miss when citations avoid the supporting evidence', () => {
    expect(
      scoreOutcome(
        outcome({
          id: 'miss',
          citations: [DOC_B],
          expected: [DOC_A],
          supporting: [DOC_A],
        }),
      ).groundingHit,
    ).toBe(false);
  });
});

describe('percentile', () => {
  it('returns null for an empty sample', () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it('uses nearest-rank selection', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40);
    expect(percentile([7], 0.95)).toBe(7);
  });
});


describe('retrieval corpus', () => {
  it('places the beacon facts in adjacent chunks on the same page', () => {
    const page = EVAL_CORPUS.find(
      (document) => document.title === 'Orion Field Manual',
    )?.pages[0];
    expect(page).toBeDefined();
    if (!page) throw new Error('Missing Orion Field Manual page');
    const chunks = chunkPages([{ pageNumber: page.pageNumber, content: page.text }]);
    const first = chunks.findIndex((chunk) =>
      chunk.content.includes('violet calibration token'),
    );
    const second = chunks.findIndex((chunk) => chunk.content.includes('43 minutes'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(first + 1);
    expect(chunks.length).toBeGreaterThan(2);
  });
});
