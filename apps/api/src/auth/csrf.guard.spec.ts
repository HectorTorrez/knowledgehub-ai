import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { SecurityAuditService } from '../audit/security-audit.service.js';
import type { AuthConfig } from './auth.config.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { CSRF_COOKIE, CSRF_HEADER, generateCsrfToken } from './csrf.js';
import {
  CsrfGuard,
  ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED,
} from './csrf.guard.js';

const SECRET = 'csrf-secret-value-that-is-at-least-32-chars';
const TRUSTED_ORIGIN = 'http://localhost:3000';

interface FakeRequest {
  method: string;
  headers: Record<string, string>;
  cookies?: Record<string, string>;
}

class TestController {
  plain(): void {}
  logout(): void {}
}

Reflect.defineMetadata(
  ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED,
  true,
  TestController.prototype.logout,
);

function context(
  request: FakeRequest,
  handler: object = TestController.prototype.plain,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

function buildGuard(
  options: {
    browserAuthEnabled?: boolean;
    csrfSecretOrUndefined?: string | undefined;
  } = {},
) {
  const authConfig = {
    browserAuthEnabled: options.browserAuthEnabled ?? true,
    csrfSecret: SECRET,
    csrfSecretOrUndefined:
      'csrfSecretOrUndefined' in options
        ? options.csrfSecretOrUndefined
        : SECRET,
    trustedOrigins: [TRUSTED_ORIGIN],
  } as unknown as AuthConfig;

  return new CsrfGuard(
    authConfig,
    new Reflector(),
    { record: () => undefined } as unknown as SecurityAuditService,
  );
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

  it('enforces CSRF for an empty bearer credential with a valid cookie (no bypass)', () => {
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { authorization: 'Bearer ', origin: TRUSTED_ORIGIN },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('enforces CSRF for a malformed bearer credential with a valid cookie', () => {
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { authorization: 'Bearer', origin: TRUSTED_ORIGIN },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows cookie auth with CSRF when the bearer credential is empty', () => {
    const guard = buildGuard();
    const { cookie, header } = validCsrf();

    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: { authorization: 'Bearer ', origin: TRUSTED_ORIGIN, [CSRF_HEADER]: header },
          cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
        }),
      ),
    ).toBe(true);
  });

  it('skips CSRF for a valid bearer credential regardless of origin', () => {
    const guard = buildGuard();

    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: { authorization: 'Bearer access-token', origin: 'http://evil.test' },
          ...validCookieAuth(),
        }),
      ),
    ).toBe(true);
  });
});

describe('CsrfGuard disabled-browser-auth logout exemption', () => {
  function logoutRequest(
    overrides: {
      headers?: Record<string, string>;
      cookieToken?: string;
    } = {},
  ): FakeRequest {
    const { cookie, header } = validCsrf();
    const cookieToken = overrides.cookieToken ?? cookie;

    return {
      method: 'POST',
      headers: {
        origin: TRUSTED_ORIGIN,
        [CSRF_HEADER]: header,
        ...overrides.headers,
      },
      cookies: {
        [ACCESS_TOKEN_COOKIE]: 'access-token',
        [CSRF_COOKIE]: cookieToken,
      },
    };
  }

  it('lets a marked handler through when disabled, still requiring origin and CSRF', () => {
    const guard = buildGuard({ browserAuthEnabled: false });

    expect(
      guard.canActivate(context(logoutRequest(), TestController.prototype.logout)),
    ).toBe(true);
  });

  it('leaves unmarked handlers rejected when disabled', () => {
    const guard = buildGuard({ browserAuthEnabled: false });

    expect(() =>
      guard.canActivate(context(logoutRequest(), TestController.prototype.plain)),
    ).toThrow(ForbiddenException);
  });

  it('still rejects the marked handler on an untrusted origin when disabled', () => {
    const guard = buildGuard({ browserAuthEnabled: false });

    expect(() =>
      guard.canActivate(
        context(
          logoutRequest({ headers: { origin: 'http://evil.test' } }),
          TestController.prototype.logout,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('still rejects the marked handler without a CSRF header when disabled', () => {
    const guard = buildGuard({ browserAuthEnabled: false });
    const { cookie } = validCsrf();

    expect(() =>
      guard.canActivate(
        context(
          {
            method: 'POST',
            headers: { origin: TRUSTED_ORIGIN },
            cookies: { [ACCESS_TOKEN_COOKIE]: 'access-token', [CSRF_COOKIE]: cookie },
          },
          TestController.prototype.logout,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('still rejects the marked handler with a forged CSRF token when disabled', () => {
    const guard = buildGuard({ browserAuthEnabled: false });

    expect(() =>
      guard.canActivate(
        context(
          logoutRequest({ cookieToken: 'forged', headers: { [CSRF_HEADER]: 'forged' } }),
          TestController.prototype.logout,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects the marked handler when disabled and no CSRF secret is configured', () => {
    const guard = buildGuard({
      browserAuthEnabled: false,
      csrfSecretOrUndefined: undefined,
    });

    expect(() =>
      guard.canActivate(
        context(logoutRequest(), TestController.prototype.logout),
      ),
    ).toThrow(ForbiddenException);
  });

  it('validates the marked handler normally when browser auth is enabled', () => {
    const guard = buildGuard({ browserAuthEnabled: true });

    expect(
      guard.canActivate(context(logoutRequest(), TestController.prototype.logout)),
    ).toBe(true);
  });
});
