import { normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('lower-cases the address', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@example.com\t')).toBe('user@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('  User@Example.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('maps differently-cased inputs for the same address to one value', () => {
    expect(normalizeEmail('USER@example.com')).toBe(
      normalizeEmail('user@EXAMPLE.com'),
    );
  });
});
