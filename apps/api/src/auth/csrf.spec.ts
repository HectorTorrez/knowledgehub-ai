import { describe, expect, it } from 'vitest';
import {
  CSRF_COOKIE_PATH,
  buildCsrfCookieOptions,
  csrfTokensMatch,
  generateCsrfToken,
  isTrustedOrigin,
  isUnsafeMethod,
  originFromUrl,
  resolveRequestOrigin,
  verifyCsrfToken,
} from './csrf.js';

const SECRET = 'csrf-secret-value-that-is-at-least-32-chars';
const OTHER_SECRET = 'another-csrf-secret-value-of-32-or-more';

describe('generateCsrfToken', () => {
  it('produces a nonce.signature token with fixed-width base64url parts', () => {
    const token = generateCsrfToken(SECRET);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  });

  it('generates a distinct token on each call', () => {
    expect(generateCsrfToken(SECRET)).not.toBe(generateCsrfToken(SECRET));
  });

  it('round-trips through verification', () => {
    const token = generateCsrfToken(SECRET);
    expect(verifyCsrfToken(SECRET, token)).toBe(true);
  });
});

describe('verifyCsrfToken', () => {
  it('rejects a token signed with a different secret', () => {
    const token = generateCsrfToken(OTHER_SECRET);
    expect(verifyCsrfToken(SECRET, token)).toBe(false);
  });

  it('rejects a tampered nonce', () => {
    const token = generateCsrfToken(SECRET);
    const [nonce, signature] = token.split('.');
    const flipped = `${nonce[0] === 'A' ? 'B' : 'A'}${nonce.slice(1)}.${signature}`;

    expect(verifyCsrfToken(SECRET, flipped)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = generateCsrfToken(SECRET);
    const [nonce, signature] = token.split('.');
    const flipped = `${nonce}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

    expect(verifyCsrfToken(SECRET, flipped)).toBe(false);
  });

  it('rejects malformed or empty values without throwing', () => {
    expect(verifyCsrfToken(SECRET, '')).toBe(false);
    expect(verifyCsrfToken(SECRET, 'not-a-token')).toBe(false);
    expect(verifyCsrfToken(SECRET, 'a.b.c')).toBe(false);
    expect(verifyCsrfToken(SECRET, undefined)).toBe(false);
    expect(verifyCsrfToken(SECRET, 123)).toBe(false);
  });
});

describe('csrfTokensMatch', () => {
  it('matches identical strings and rejects differing ones', () => {
    expect(csrfTokensMatch('same', 'same')).toBe(true);
    expect(csrfTokensMatch('same', 'different')).toBe(false);
    expect(csrfTokensMatch('short', 'longer-value')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(csrfTokensMatch(undefined, 'value')).toBe(false);
    expect(csrfTokensMatch('value', undefined)).toBe(false);
  });
});

describe('buildCsrfCookieOptions', () => {
  const policy = { secure: true, sameSite: 'lax' as const };

  it('is JavaScript-readable and scoped to the whole site', () => {
    const options = buildCsrfCookieOptions(policy, 604_800_000);

    expect(options).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: CSRF_COOKIE_PATH,
      maxAge: 604_800_000,
    });
    expect(options.domain).toBeUndefined();
  });
});

describe('isUnsafeMethod', () => {
  it('flags state-changing methods case-insensitively', () => {
    for (const method of ['POST', 'put', 'Patch', 'delete']) {
      expect(isUnsafeMethod(method)).toBe(true);
    }
  });

  it('treats safe and missing methods as safe', () => {
    for (const method of ['GET', 'head', 'OPTIONS', undefined]) {
      expect(isUnsafeMethod(method)).toBe(false);
    }
  });
});

describe('origin helpers', () => {
  it('parses the origin from an absolute URL', () => {
    expect(originFromUrl('http://localhost:3000/some/path?q=1')).toBe(
      'http://localhost:3000',
    );
  });

  it('returns undefined for missing or unparseable URLs', () => {
    expect(originFromUrl(undefined)).toBeUndefined();
    expect(originFromUrl('not a url')).toBeUndefined();
  });

  it('prefers the Origin header', () => {
    expect(
      resolveRequestOrigin({
        headers: { origin: 'http://localhost:3000', referer: 'http://evil.test' },
      }),
    ).toBe('http://localhost:3000');
  });

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(
      resolveRequestOrigin({
        headers: { referer: 'http://localhost:3000/login' },
      }),
    ).toBe('http://localhost:3000');
  });

  it('returns undefined when neither header is usable', () => {
    expect(resolveRequestOrigin({ headers: {} })).toBeUndefined();
    expect(resolveRequestOrigin({ headers: { referer: 'not a url' } })).toBe(
      undefined,
    );
  });

  it('accepts only explicitly trusted origins', () => {
    const trusted = ['http://localhost:3000'];
    expect(isTrustedOrigin('http://localhost:3000', trusted)).toBe(true);
    expect(isTrustedOrigin('http://evil.test', trusted)).toBe(false);
    expect(isTrustedOrigin('null', trusted)).toBe(false);
    expect(isTrustedOrigin(undefined, trusted)).toBe(false);
  });
});
