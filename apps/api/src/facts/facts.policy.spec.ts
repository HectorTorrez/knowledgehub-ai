import { describe, expect, it } from 'vitest';
import {
  hasContractTotalHeader,
  normalizeWhitespace,
  uncoveredMoneyTokens,
  validateFactDraft,
} from './facts.policy.js';

const PAGE =
  'ID Contrato Cliente Ejecutivo Estado Monto Total Fecha Registro ' +
  '1143 Plan Personalizado Lacteos Reyes Andrea Aguilar Vigente $500.00 28/07/2026';

const CURRENCIES = new Set(['USD', 'EUR']);

const DRAFT = {
  contractId: '1143',
  label: 'Plan Personalizado Lacteos Reyes',
  amountText: '$500.00',
  currency: 'USD',
  evidenceText:
    '1143 Plan Personalizado Lacteos Reyes Andrea Aguilar Vigente $500.00 28/07/2026',
};

describe('normalizeWhitespace', () => {
  it('collapses runs of whitespace and trims', () => {
    expect(normalizeWhitespace('  a \n b\t c ')).toBe('a b c');
  });
});

describe('hasContractTotalHeader', () => {
  it('recognizes a contract table with a total column', () => {
    expect(
      hasContractTotalHeader(
        'ID Contrato Cliente Ejecutivo Estado Monto Total Fecha Registro',
      ),
    ).toBe(true);
  });

  it('recognizes a Spanish contract total header', () => {
    expect(hasContractTotalHeader('Contrato Total del contrato')).toBe(true);
  });

  it('rejects a shipment log that only has a generic amount column', () => {
    expect(
      hasContractTotalHeader(
        'Guía Fecha de entrega Cliente Teléfono Dirección Monto Estado de pago',
      ),
    ).toBe(false);
  });
});

describe('uncoveredMoneyTokens', () => {
  it('returns zero when every amount falls inside an evidence span', () => {
    expect(
      uncoveredMoneyTokens(PAGE, [
        '1143 Plan Personalizado Lacteos Reyes Andrea Aguilar Vigente $500.00 28/07/2026',
      ]),
    ).toEqual([]);
  });

  it('counts an amount that no evidence covers', () => {
    const page = `${PAGE} 9999 Otro Cliente $75.00 01/01/2027`;

    expect(
      uncoveredMoneyTokens(page, [
        '1143 Plan Personalizado Lacteos Reyes Andrea Aguilar Vigente $500.00 28/07/2026',
      ]),
    ).toEqual(['$75.00']);
  });

  it('ignores a price that belongs to a row label', () => {
    const page =
      '131 PLAN ENVÍOS HUB ($75.00 + IVA) Agencia Rivas $508.50 09/07/2026';

    expect(
      uncoveredMoneyTokens(page, [
        '131 PLAN ENVÍOS HUB ($75.00 + IVA) Agencia Rivas $508.50 09/07/2026',
      ]),
    ).toEqual([]);
  });

  it('covers repeated evidence occurrences', () => {
    const evidence = '1143 Plan $500.00 28/07/2026';

    expect(uncoveredMoneyTokens(`${evidence} ${evidence}`, [evidence])).toEqual(
      [],
    );
  });
});

describe('validateFactDraft', () => {
  it('accepts a fact whose evidence and amount appear on the page', () => {
    const result = validateFactDraft(DRAFT, PAGE, CURRENCIES, 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.naturalKey).toBe('1143');
      expect(result.fact.amountMinor).toBe(50000n);
      expect(result.fact.currency).toBe('USD');
      expect(result.fact.pageNumber).toBe(1);
    }
  });

  it('rejects evidence that is not present verbatim on the page', () => {
    const result = validateFactDraft(
      { ...DRAFT, evidenceText: '1143 Invented Client $500.00' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result).toEqual({ ok: false, reason: 'EVIDENCE_NOT_FOUND' });
  });

  it('rejects an amount that is not part of the evidence', () => {
    const result = validateFactDraft(
      { ...DRAFT, amountText: '$6,000.00' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result).toEqual({ ok: false, reason: 'AMOUNT_NOT_IN_EVIDENCE' });
  });

  it('rejects a currency outside the allow-list', () => {
    const result = validateFactDraft(
      { ...DRAFT, currency: 'ARS' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
  });

  it('infers the currency from the symbol when the model returns none', () => {
    const result = validateFactDraft(
      { ...DRAFT, currency: '' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.currency).toBe('USD');
    }
  });

  it('derives a stable key when the row has no contract id', () => {
    const first = validateFactDraft(
      { ...DRAFT, contractId: '' },
      PAGE,
      CURRENCIES,
      1,
    );
    const second = validateFactDraft(
      { ...DRAFT, contractId: '' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.fact.naturalKey).toMatch(/^derived:[a-f0-9]{32}$/);
      expect(second.fact.naturalKey).toBe(first.fact.naturalKey);
    }
  });

  it('rejects an unparseable amount', () => {
    const result = validateFactDraft(
      { ...DRAFT, amountText: '$' },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
  });

  it('rejects evidence longer than the limit', () => {
    const result = validateFactDraft(
      { ...DRAFT, evidenceText: `1143 ${'x'.repeat(600)}` },
      PAGE,
      CURRENCIES,
      1,
    );

    expect(result).toEqual({ ok: false, reason: 'EVIDENCE_TOO_LONG' });
  });

  it('rejects blank evidence', () => {
    expect(
      validateFactDraft({ ...DRAFT, evidenceText: '   ' }, PAGE, CURRENCIES, 1),
    ).toEqual({ ok: false, reason: 'MISSING_EVIDENCE' });
  });
});
