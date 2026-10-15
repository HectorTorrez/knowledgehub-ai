import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthConfig } from './auth.config.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { CSRF_COOKIE, CSRF_HEADER, generateCsrfToken } from './csrf.js';
import { CsrfGuard } from './csrf.guard.js';

const SECRET = 'csrf-secret-value-that-is-at-least-32-chars';
const TRUSTED_ORIGIN = 'http://localhost:3000';

interface FakeRequest {
  method: string;
  headers: Record<string, string>;
  cookies?: Record<string, string>;
}

function context(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(options: { browserAuthEnabled?: boolean } = {}) {
  const authConfig = {
    browserAuthEnabled: options.browserAuthEnabled ?? true,
    csrfSecret: SECRET,
    trustedOrigins: [TRUSTED_ORIGIN],
  } as unknown as AuthConfig;

  return new CsrfGuard(authConfig);
}

function validCookieAuth(): { cookies: Record<string, string> } {
  return { cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token' } };
}

function validCsrf(): { cookie: string; header: string } {
  const token = generateCsrfToken(SECRET);
  return { cookie: token, header: token };
}

describe('CsrfGuard', () => {
  it('allows safe methods even when authenticated by cookie', () => {
    const guard = buildGuard();

    expect(
      guard.canActivate(
        context({
          method: 'GET',
          headers: { origin: TRUSTED_ORIGIN },
          ...validCookieAuth(),
        }),
      ),
    ).toBe(true);
  });

  it('allows unsafe requests that carry no auth cookies (e.g. registration)', () => {
    const guard = buildGuard();

    expect(
      guard.canActivate(
        context({ method: 'POST', headers: { origin: 'http://evil.test' } }),
      ),
    ).toBe(true);
  });

  it('does not impose cookie CSRF rules on bearer-authenticated requests', () => {
    const guard = buildGuard();

    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: { authorization: 'Bearer access-token' },
          ...validCookieAuth(),
        }),
      ),
    ).toBe(true);
  });

  it('allows a cookie-authenticated unsafe request with a trusted origin and token', () => {
    const guard = buildGuard();
    const { cookie, header } = validCsrf();

    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: TRUSTED_ORIGIN, [CSRF_HEADER]: header },
          ...validCookieAuth(),
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toBe(true);
  });

  it('accepts a trusted Referer when the Origin header is absent', () => {
    const guard = buildGuard();
    const { cookie, header } = validCsrf();

    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: { referer: `${TRUSTED_ORIGIN}/register`, [CSRF_HEADER]: header },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toBe(true);
  });

  it('rejects when neither Origin nor Referer is present', () => {
    const guard = buildGuard();
    const { cookie, header } = validCsrf();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { [CSRF_HEADER]: header },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects an untrusted origin', () => {
    const guard = buildGuard();
    const { cookie, header } = validCsrf();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: 'http://evil.test', [CSRF_HEADER]: header },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a missing CSRF header', () => {
    const guard = buildGuard();
    const { cookie } = validCsrf();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: TRUSTED_ORIGIN },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a header that does not match the cookie', () => {
    const guard = buildGuard();
    const { cookie } = validCsrf();
    const other = generateCsrfToken(SECRET);

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: TRUSTED_ORIGIN, [CSRF_HEADER]: other },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a cookie token with an invalid signature', () => {
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: TRUSTED_ORIGIN, [CSRF_HEADER]: 'forged' },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: 'forged' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects cookie-authenticated writes when browser authentication is disabled', () => {
    const guard = buildGuard({ browserAuthEnabled: false });
    const { cookie, header } = validCsrf();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: TRUSTED_ORIGIN, [CSRF_HEADER]: header },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
