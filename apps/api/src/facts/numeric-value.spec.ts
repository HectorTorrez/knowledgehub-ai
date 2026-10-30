import { describe, expect, it } from 'vitest';
import {
  normalizeFieldName,
  numericFactNaturalKey,
  parseNumericText,
} from './numeric-value.js';

describe('parseNumericText', () => {
  it.each([
    ['USD 1,234.56', 123456n, 2, false],
    ['1.234,56 €', 123456n, 2, false],
    ['1 234,56', 123456n, 2, false],
    ['(12.5%)', null, null, null],
    ['(12.5)%', -125n, 1, true],
    ['-42', -42n, 0, false],
    ['1,234', 1234n, 0, false],
    ['1,2345', 12345n, 4, false],
    ['1234.123456', 1234123456n, 6, false],
  ])('parses %s', (text, valueMinor, scale, percent) => {
    expect(parseNumericText(text)).toEqual(
      valueMinor === null ? null : { valueMinor, scale, percent },
    );
  });

  it.each(['', '12abc', '1,23,456', '1.1234567', '1..2', '--2'])(
    'rejects %s',
    (text) => expect(parseNumericText(text)).toBeNull(),
  );
});

describe('numeric fact identity', () => {
  it('hashes all identity fields deterministically', () => {
    const input = {
      pageNumber: 1,
      field: 'revenue',
      entityId: 'a',
      rowIndex: 0,
      valueText: '10',
    };
    expect(numericFactNaturalKey(input)).toMatch(/^derived:[a-f0-9]{32}$/);
    expect(numericFactNaturalKey(input)).toBe(numericFactNaturalKey({ ...input }));
    expect(numericFactNaturalKey(input)).not.toBe(
      numericFactNaturalKey({ ...input, rowIndex: 1 }),
    );
  });

  it('normalizes and limits field names', () => {
    expect(normalizeFieldName('  Ingresos Ánuales / Total  ')).toBe(
      'ingresos_anuales_total',
    );
    expect(normalizeFieldName('a'.repeat(80))).toHaveLength(64);
  });
});
