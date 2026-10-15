import type { CookieOptions } from 'express';

/** Name of the short-lived access-token cookie. */
export const ACCESS_TOKEN_COOKIE = 'access_token';
/** Name of the long-lived refresh-token cookie. */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Access cookie is sent to the whole API. */
export const ACCESS_TOKEN_COOKIE_PATH = '/';
/** Refresh cookie is scoped to auth routes so it is not attached elsewhere. */
export const REFRESH_TOKEN_COOKIE_PATH = '/auth';

export type SameSitePolicy = 'lax' | 'strict' | 'none';

export interface CookiePolicy {
  secure: boolean;
  sameSite: SameSitePolicy;
  domain?: string;
}

export interface CookieEnv {
  NODE_ENV?: string;
  COOKIE_SECURE?: string;
  COOKIE_SAMESITE?: string;
  COOKIE_DOMAIN?: string;
}

/**
 * Resolves the cookie security policy from the environment.
 *
 * `secure` is on by default in production and can be overridden explicitly.
 * `SameSite=None` forces `Secure`, since browsers reject a `None` cookie that
 * is not also `Secure`.
 */
export function resolveCookiePolicy(env: CookieEnv): CookiePolicy {
  const sameSite: SameSitePolicy =
    (env.COOKIE_SAMESITE as SameSitePolicy | undefined) ?? 'lax';
  const secure =
    env.COOKIE_SECURE !== undefined
      ? env.COOKIE_SECURE === 'true'
      : env.NODE_ENV === 'production';

  return {
    secure: sameSite === 'none' ? true : secure,
    sameSite,
    domain: env.COOKIE_DOMAIN,
  };
}

function baseCookieOptions(
  policy: CookiePolicy,
  path: string,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: policy.secure,
    sameSite: policy.sameSite,
    domain: policy.domain,
    path,
    maxAge: maxAgeMs,
  };
}

export function buildAccessCookieOptions(
  policy: CookiePolicy,
  maxAgeMs: number,
): CookieOptions {
  return baseCookieOptions(policy, ACCESS_TOKEN_COOKIE_PATH, maxAgeMs);
}

export function buildRefreshCookieOptions(
  policy: CookiePolicy,
  maxAgeMs: number,
): CookieOptions {
  return baseCookieOptions(policy, REFRESH_TOKEN_COOKIE_PATH, maxAgeMs);
}
