import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthConfig } from './auth.config.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './cookies.js';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  csrfTokensMatch,
  isTrustedOrigin,
  isUnsafeMethod,
  resolveRequestOrigin,
  verifyCsrfToken,
} from './csrf.js';

/**
 * Enforces CSRF protection on unsafe, cookie-authenticated requests.
 *
 * - Safe methods (GET/HEAD/OPTIONS) are never challenged.
 * - Requests authenticated with `Authorization: Bearer` are skipped: an
 *   attacker cannot set that header cross-site, so bearer clients are not
 *   vulnerable to CSRF and must not be subjected to the cookie rules.
 * - Requests without an auth cookie (for example registration, which has no
 *   session yet) are skipped: there is no ambient cookie authority to abuse.
 *
 * For everything else the guard validates the request origin (Origin header,
 * falling back to the Referer origin) against the CORS allow-list, then checks
 * the signed double-submit token from the JavaScript-readable cookie against the
 * `X-CSRF-Token` header using timing-safe comparisons. When browser
 * authentication is disabled the guard rejects the request outright, so a
 * deployment cannot accept cookie-authenticated writes without CSRF.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly authConfig: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!isUnsafeMethod(request.method)) {
      return true;
    }

    if (isBearerAuthenticated(request)) {
      return true;
    }

    if (!isCookieAuthenticated(request)) {
      return true;
    }

    if (!this.authConfig.browserAuthEnabled) {
      throw new ForbiddenException('Browser authentication is disabled');
    }

    const origin = resolveRequestOrigin(request);
    if (!isTrustedOrigin(origin, this.authConfig.trustedOrigins)) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = readHeader(request, CSRF_HEADER);

    if (
      !verifyCsrfToken(this.authConfig.csrfSecret, cookieToken) ||
      !csrfTokensMatch(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }
}

function isBearerAuthenticated(request: Request): boolean {
  return request.headers.authorization?.startsWith('Bearer ') === true;
}

function isCookieAuthenticated(request: Request): boolean {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  if (!cookies) {
    return false;
  }

  return isNonEmptyString(cookies[ACCESS_TOKEN_COOKIE]) ||
    isNonEmptyString(cookies[REFRESH_TOKEN_COOKIE]);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
