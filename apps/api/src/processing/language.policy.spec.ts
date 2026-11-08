import { detectLanguage } from './language.policy.js';

describe('detectLanguage', () => {
  it('detects Spanish and English from stopwords', () => {
    expect(detectLanguage('las facturas de la empresa y el cliente')).toBe(
      'es',
    );
    expect(detectLanguage('the invoices of the company and the customer')).toBe(
      'en',
    );
  });
  it('returns unknown for ambiguous text', () => {
    expect(detectLanguage('factura invoice')).toBe('unknown');
    expect(detectLanguage('the la')).toBe('unknown');
  });
});
