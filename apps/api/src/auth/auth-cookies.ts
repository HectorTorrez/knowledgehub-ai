import type { Response } from 'express';
import type { AuthConfig } from './auth.config.js';
import type { AuthResult } from './auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  buildAccessCookieOptions,
  buildClearAccessCookieOptions,
  buildClearRefreshCookieOptions,
  buildRefreshCookieOptions,
} from './cookies.js';
import {
  CSRF_COOKIE,
  buildClearCsrfCookieOptions,
  buildCsrfCookieOptions,
  generateCsrfToken,
} from './csrf.js';

export function issueAuthCookies(
  response: Response,
  authConfig: AuthConfig,
  result: AuthResult,
): void {
  const policy = authConfig.cookiePolicy;
  response.cookie(
    ACCESS_TOKEN_COOKIE,
    result.accessToken,
    buildAccessCookieOptions(policy, authConfig.accessTtlMs),
  );
  response.cookie(
    REFRESH_TOKEN_COOKIE,
    result.refreshToken,
    buildRefreshCookieOptions(
      policy,
      result.refreshTokenMaxAgeMs ?? authConfig.refreshTtlMs,
    ),
  );

  if (authConfig.browserAuthEnabled) {
    response.cookie(
      CSRF_COOKIE,
      generateCsrfToken(authConfig.csrfSecret),
      buildCsrfCookieOptions(policy, authConfig.sessionTtlMs),
    );
  }
}

export function clearAuthCookies(
  response: Response,
  authConfig: AuthConfig,
): void {
  const policy = authConfig.cookiePolicy;
  response.clearCookie(
    ACCESS_TOKEN_COOKIE,
    buildClearAccessCookieOptions(policy),
  );
  response.clearCookie(
    REFRESH_TOKEN_COOKIE,
    buildClearRefreshCookieOptions(policy),
  );
  response.clearCookie(CSRF_COOKIE, buildClearCsrfCookieOptions(policy));
}
