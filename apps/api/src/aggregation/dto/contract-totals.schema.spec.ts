import { describe, expect, it } from 'vitest';
import {
  CONTRACT_TOTALS_DEFAULT_LIMIT,
  CONTRACT_TOTALS_MAX_LIMIT,
  contractTotalsSchema,
} from './contract-totals.schema.js';

describe('contractTotalsSchema', () => {
  it('applies the default limit and offset', () => {
    const result = contractTotalsSchema.parse({});

    expect(result.limit).toBe(CONTRACT_TOTALS_DEFAULT_LIMIT);
    expect(result.offset).toBe(0);
  });

  it('uppercases the currency code', () => {
    expect(contractTotalsSchema.parse({ currency: 'usd' }).currency).toBe('USD');
  });

  it('rejects a malformed currency code', () => {
    expect(contractTotalsSchema.safeParse({ currency: 'US' }).success).toBe(
      false,
    );
  });

  it('rejects a malformed document id', () => {
    expect(
      contractTotalsSchema.safeParse({ documentId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects a limit above the maximum', () => {
    expect(
      contractTotalsSchema.safeParse({ limit: CONTRACT_TOTALS_MAX_LIMIT + 1 })
        .success,
    ).toBe(false);
  });

  it('rejects unknown query parameters', () => {
    expect(contractTotalsSchema.safeParse({ unexpected: 'value' }).success).toBe(
      false,
    );
  });
});
