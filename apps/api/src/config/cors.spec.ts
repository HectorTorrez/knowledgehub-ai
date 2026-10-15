import {
  CORS_ALLOWED_HEADERS,
  DEFAULT_CORS_ORIGIN,
  buildCorsOptions,
  resolveCorsOrigins,
} from './cors.js';

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

describe('buildCorsOptions', () => {
  it('enables credentials with an explicit origin allow-list', () => {
    const options = buildCorsOptions(['http://localhost:3000']);

    expect(options).toMatchObject({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });

  it('permits the CSRF header so cross-origin writes are not blocked', () => {
    expect(CORS_ALLOWED_HEADERS).toContain('X-CSRF-Token');
  });
});
