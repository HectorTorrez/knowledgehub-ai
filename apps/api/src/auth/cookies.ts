import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const ACCESS_TOKEN_COOKIE_PATH = '/';
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

/**
 * A browser only removes a cookie when the clearing `Set-Cookie` matches its
 * name, path and domain, so a stale cookie on a differently-scoped path would
 * otherwise survive logout.
 */
function clearCookieOptions(policy: CookiePolicy, path: string): CookieOptions {
  return {
    httpOnly: true,
    secure: policy.secure,
    sameSite: policy.sameSite,
    domain: policy.domain,
    path,
  };
}

export function buildClearAccessCookieOptions(
  policy: CookiePolicy,
): CookieOptions {
  return clearCookieOptions(policy, ACCESS_TOKEN_COOKIE_PATH);
}

export function buildClearRefreshCookieOptions(
  policy: CookiePolicy,
): CookieOptions {
  return clearCookieOptions(policy, REFRESH_TOKEN_COOKIE_PATH);
}
