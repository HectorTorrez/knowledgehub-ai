import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE_PATH,
  buildAccessCookieOptions,
  buildClearAccessCookieOptions,
  buildClearRefreshCookieOptions,
  buildRefreshCookieOptions,
  resolveCookiePolicy,
} from './cookies.js';

describe('resolveCookiePolicy', () => {
  it('enables Secure automatically in production', () => {
    expect(resolveCookiePolicy({ NODE_ENV: 'production' }).secure).toBe(true);
  });

  it('leaves Secure off outside production', () => {
    expect(resolveCookiePolicy({ NODE_ENV: 'development' }).secure).toBe(false);
    expect(resolveCookiePolicy({ NODE_ENV: 'test' }).secure).toBe(false);
  });

  it('honours an explicit COOKIE_SECURE override', () => {
    expect(
      resolveCookiePolicy({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })
        .secure,
    ).toBe(false);
    expect(
      resolveCookiePolicy({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })
        .secure,
    ).toBe(true);
  });

  it('defaults SameSite to lax and passes through domain', () => {
    const policy = resolveCookiePolicy({ COOKIE_DOMAIN: '.example.com' });
    expect(policy.sameSite).toBe('lax');
    expect(policy.domain).toBe('.example.com');
  });

  it('forces Secure when SameSite is none', () => {
    const policy = resolveCookiePolicy({
      NODE_ENV: 'development',
      COOKIE_SAMESITE: 'none',
    });
    expect(policy.secure).toBe(true);
  });
});

describe('cookie option builders', () => {
  const policy = { secure: true, sameSite: 'lax' as const };

  it('marks the access cookie HttpOnly, Secure and path-scoped to /', () => {
    const options = buildAccessCookieOptions(policy, 900_000);

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: ACCESS_TOKEN_COOKIE_PATH,
      maxAge: 900_000,
    });
  });

  it('scopes the refresh cookie to /auth', () => {
    const options = buildRefreshCookieOptions(policy, 604_800_000);

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: 604_800_000,
    });
    expect(options.path).toBe('/auth');
  });

  it('omits domain when not configured (host-only cookie)', () => {
    expect(buildAccessCookieOptions(policy, 1).domain).toBeUndefined();
  });
});

describe('cookie clearing option builders', () => {
  const policy = {
    secure: true,
    sameSite: 'lax' as const,
    domain: '.example.com',
  };

  it('clears the access cookie on its original path with matching attributes', () => {
    expect(buildClearAccessCookieOptions(policy)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: '.example.com',
      path: ACCESS_TOKEN_COOKIE_PATH,
    });
    expect(buildClearAccessCookieOptions(policy).maxAge).toBeUndefined();
  });

  it('clears the refresh cookie on the /auth path', () => {
    expect(buildClearRefreshCookieOptions(policy)).toMatchObject({
      httpOnly: true,
      secure: true,
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
    expect(buildClearRefreshCookieOptions(policy).path).toBe('/auth');
  });
});
