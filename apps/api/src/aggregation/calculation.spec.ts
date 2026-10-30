import { describe, expect, it } from 'vitest';
import { calculate, filterFacts } from './calculation.js';
import type { CalculationPlan, NumericFactRow } from './calculation.js';

const plan: CalculationPlan = {
  operation: 'sum', fields: [], entityIds: [], entityLabelContains: null,
  documentId: null, dateFrom: null, dateTo: null, currency: null,
  groupBy: 'none', includeTotals: false,
};
const row: NumericFactRow = {
  id: '1', documentId: 'd', documentTitle: 'Doc', field: 'a', fieldLabel: 'A',
  amountMinor: 15n, scale: 1, currency: 'USD', unit: null, entityId: 'x',
  entityLabel: 'Álpha', occurredOn: new Date('2026-01-01'), isTotal: false,
  pageNumber: 1, chunkIndex: null, evidenceText: 'evidence',
};

describe('numeric calculations', () => {
  it('aligns scales and separates currencies', () => {
    const result = calculate([row, { ...row, id: '2', amountMinor: 225n, scale: 2 },
      { ...row, id: '3', currency: 'EUR' }], plan);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.groups.map((group) => group.valueMinor)).toEqual([375n, 15n]);
    }
  });
  it('filters totals, dates and accent-insensitive labels', () => {
    expect(filterFacts([row, { ...row, isTotal: true }], {
      ...plan, entityLabelContains: 'alpha', dateFrom: '2026-01-01',
      dateTo: '2026-01-01',
    })).toEqual([row]);
  });
  it('groups by entity and month', () => {
    const rows = [row, {
      ...row, id: '2', entityId: 'y', occurredOn: new Date('2026-02-01'),
    }];
    for (const groupBy of ['entity', 'month'] as const) {
      const result = calculate(rows, { ...plan, groupBy });
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.groups).toHaveLength(2);
      }
    }
  });
  it('rejects zero denominators and missing operands', () => {
    const zero = { ...row, id: '2', field: 'b', amountMinor: 0n };
    expect(calculate([row, zero], {
      ...plan, operation: 'percentage', fields: ['a', 'b'],
    }).status).toBe('unsupported');
    expect(calculate([row], { ...plan, operation: 'difference' }).status)
      .toBe('unsupported');
  });
  it('handles arithmetic operations and unsupported operands', () => {
    const rows = [row, { ...row, id: '2', field: 'b', amountMinor: -5n }];
    for (const [operation, value] of [
      ['sum', 10n], ['average', 50n], ['min', -5n], ['max', 15n],
      ['count', 2n], ['difference', 20n], ['percentage', -30000n],
    ] as const) {
      const result = calculate(rows, { ...plan, operation, fields: ['a', 'b'] });
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.groups[0]?.valueMinor).toBe(value);
      }
    }
    expect(calculate([row], { ...plan, operation: 'percentage', fields: ['a', 'b'] })
      .status).toBe('unsupported');
  });
});
