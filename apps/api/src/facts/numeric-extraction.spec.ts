import { describe, expect, it } from 'vitest';
import { validateNumericDraft } from './numeric-value.js';
import { NUMERIC_RESPONSE_FORMAT } from './numeric-extraction-prompt.js';
import { parseNumericResponse } from './openai-fact-extractor.js';

const draft = {
  field: 'Precio unitario',
  fieldLabel: 'Precio unitario',
  valueText: '12.5%',
  currency: '',
  unit: '',
  entityId: 'A1',
  entityLabel: 'Item',
  date: '2026-02-28',
  isTotal: false,
  evidenceText: 'Item 12.5%',
};

const validate = (value = draft, page = 'Item 12.5%') =>
  validateNumericDraft(value, page, new Set(['USD']), 1, 0);

describe('numeric extraction', () => {
  it('defines a strict response schema', () => {
    expect(NUMERIC_RESPONSE_FORMAT.json_schema.strict).toBe(true);
    expect(NUMERIC_RESPONSE_FORMAT.json_schema.schema.properties.facts.items.required)
      .toContain('isTotal');
  });

  it('parses numeric responses and rejects malformed entries', () => {
    const payload = (facts: unknown[]) => ({
      choices: [{ message: { content: JSON.stringify({ facts }) } }],
    });
    expect(parseNumericResponse(payload([draft]))).toEqual([draft]);
    expect(() => parseNumericResponse(payload([{ ...draft, isTotal: 'yes' }])))
      .toThrow();
  });

  it('validates evidence, currency, dates and numeric values', () => {
    expect(validate()).toMatchObject({
      field: 'precio_unitario',
      amountMinor: 125n,
      scale: 1,
      unit: '%',
    });
    expect(validate(draft, 'different')).toBeNull();
    expect(validate({ ...draft, currency: 'XYZ' })).toBeNull();
    expect(validate({ ...draft, date: '2026-02-30' })).toBeNull();
    expect(validate({ ...draft, valueText: 'abc' })).toBeNull();
  });
});
