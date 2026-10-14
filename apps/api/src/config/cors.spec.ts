import { DEFAULT_CORS_ORIGIN, resolveCorsOrigins } from './cors.js';

describe('resolveCorsOrigins', () => {
  it('falls back to the local development origin when unset', () => {
    expect(resolveCorsOrigins(undefined)).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('supports a single explicitly configured origin', () => {
    expect(resolveCorsOrigins('https://app.example.com')).toEqual([
      'https://app.example.com',
    ]);
  });

  it('supports multiple comma-separated origins and trims whitespace', () => {
    expect(
      resolveCorsOrigins('http://localhost:3000, https://app.example.com'),
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('rejects a wildcard origin when credentials are enabled', () => {
    expect(() => resolveCorsOrigins('*')).toThrow(/wildcard/i);
  });

  it('rejects a wildcard origin mixed with explicit origins', () => {
    expect(() => resolveCorsOrigins('http://localhost:3000,*')).toThrow(
      /wildcard/i,
    );
  });
});
