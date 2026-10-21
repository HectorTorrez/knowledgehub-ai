import { describe, expect, it } from 'vitest';
import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import {
  buildAggregateAnswer,
  isAggregateQuestion,
  isSpanishQuestion,
} from './aggregate-answer.js';

const RESPONSE: ContractTotalsResponse = {
  status: 'complete',
  coverage: { documents: 2, extracted: 2, failed: 0, pending: 0 },
  collapsedDuplicates: 0,
  totalFacts: 3,
  totals: [
    { currency: 'USD', scale: 2, totalMinor: '60000', contractCount: 2 },
    { currency: 'EUR', scale: 2, totalMinor: '20000', contractCount: 1 },
  ],
  sources: [
    {
      documentId: 'doc-a',
      documentTitle: 'Contracts',
      currency: 'USD',
      scale: 2,
      subtotalMinor: '60000',
      contractCount: 2,
      pageNumber: 1,
      chunkIndex: 0,
      excerpt: '1143 Plan Personalizado $500.00 28/07/2026',
    },
    {
      documentId: 'doc-b',
      documentTitle: 'European contracts',
      currency: 'EUR',
      scale: 2,
      subtotalMinor: '20000',
      contractCount: 1,
      pageNumber: 2,
      chunkIndex: 3,
      excerpt: '2001 Contrat €200.00 01/09/2026',
    },
  ],
  breakdown: [],
};

describe('isAggregateQuestion', () => {
  it.each([
    'dame la suma de montos totales',
    'dame el monto total',
    '¿cuánto suman los contratos?',
    '¿cuál es el total general?',
    'what is the total of all contracts?',
    'give me the grand total',
  ])('recognizes an aggregate request: %s', (question) => {
    expect(isAggregateQuestion(question)).toBe(true);
  });

  it.each([
    'What is the total of contract 1143?',
    '¿Cuál es el monto total del contrato 1143?',
    'How are retries bounded?',
    'What does the architecture document cover?',
  ])('does not aggregate: %s', (question) => {
    expect(isAggregateQuestion(question)).toBe(false);
  });
});

describe('isSpanishQuestion', () => {
  it('detects Spanish', () => {
    expect(isSpanishQuestion('dame la suma de montos totales')).toBe(true);
    expect(isSpanishQuestion('¿cuánto es el total?')).toBe(true);
  });

  it('detects English', () => {
    expect(isSpanishQuestion('what is the total of all contracts?')).toBe(false);
  });
});

describe('buildAggregateAnswer', () => {
  it('renders one sentence per currency with markers to each source', () => {
    const response = buildAggregateAnswer(
      RESPONSE,
      'what is the total of all contracts?',
    );

    expect(response.status).toBe('answered');
    if (response.status !== 'answered') {
      return;
    }

    expect(response.answer).toContain('The USD total is');
    expect(response.answer).toContain('The EUR total is');
    expect(response.answer).toContain('[1]');
    expect(response.answer).toContain('[2]');
    expect(response.citations).toEqual([
      expect.objectContaining({ marker: 1, documentId: 'doc-a' }),
      expect.objectContaining({ marker: 2, documentId: 'doc-b' }),
    ]);
  });

  it('answers in Spanish when the question is Spanish', () => {
    const response = buildAggregateAnswer(
      RESPONSE,
      'dame la suma de montos totales',
    );

    expect(response.status).toBe('answered');
    if (response.status === 'answered') {
      expect(response.answer).toContain('El total en USD es');
      expect(response.answer).toContain('contratos');
    }
  });

  it('states partial coverage in the answer', () => {
    const response = buildAggregateAnswer(
      { ...RESPONSE, status: 'partial' },
      'dame la suma de montos totales',
    );

    expect(response.status).toBe('answered');
    if (response.status === 'answered') {
      expect(response.answer).toContain('La cobertura es parcial');
    }
  });

  it('falls back to a plain amount when the currency is not a valid code', () => {
    const response = buildAggregateAnswer(
      {
        ...RESPONSE,
        totals: [
          { currency: 'US', scale: 2, totalMinor: '1234', contractCount: 1 },
        ],
        sources: [{ ...RESPONSE.sources[0]!, currency: 'US' }],
      },
      'what is the total?',
    );

    expect(response.status).toBe('answered');
    if (response.status === 'answered') {
      expect(response.answer).toContain('12.34 US');
    }
  });
});
