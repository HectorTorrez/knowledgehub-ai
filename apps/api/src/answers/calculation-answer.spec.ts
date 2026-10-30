import { describe, expect, it } from 'vitest';
import { calculate, type CalculationPlan, type NumericFactRow } from '../aggregation/calculation.js';
import { buildCalculationAnswer } from './calculation-answer.js';

const plan: CalculationPlan = {
  operation: 'sum',
  fields: ['amount'],
  entityIds: [],
  entityLabelContains: null,
  documentId: null,
  dateFrom: null,
  dateTo: null,
  currency: null,
  groupBy: 'none',
  includeTotals: false,
};

function fact(id: string, chunkIndex: number): NumericFactRow {
  return {
    id, documentId: 'doc', documentTitle: 'Invoice', field: 'amount',
    fieldLabel: 'Monto', amountMinor: 125n, scale: 2, currency: 'USD',
    unit: null, entityId: null, entityLabel: null, occurredOn: null,
    isTotal: false, pageNumber: 1, chunkIndex, evidenceText: 'Amount 1.25',
  };
}

describe('buildCalculationAnswer', () => {
  it('uses contributing facts and deduplicates citations', () => {
    const facts = [fact('a', 0), fact('b', 0)];
    const result = calculate(facts, plan);
    if (result.status !== 'ok') {
      throw new Error('Expected a calculation');
    }
    const answer = buildCalculationAnswer(result, plan, facts, 'en');
    expect(answer.answer).toContain('sum of Monto');
    expect(answer.answer).toContain('across 2 values [1]');
    expect(answer.citations).toHaveLength(1);
  });

  it('limits citations and explains the cap', () => {
    const facts = Array.from({ length: 21 }, (_, index) => fact(`${index}`, index));
    const result = calculate(facts, plan);
    if (result.status !== 'ok') {
      throw new Error('Expected a calculation');
    }
    const answer = buildCalculationAnswer(result, plan, facts, 'es');
    expect(answer.citations).toHaveLength(20);
    expect(answer.answer).toContain('primeros 20 de 21 valores');
  });
});
