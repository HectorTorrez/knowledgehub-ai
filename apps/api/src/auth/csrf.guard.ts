import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthConfig } from './auth.config.js';
import { extractBearerToken } from './authorization.js';
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
 * Metadata key set by {@link EnforceCsrfWhenBrowserAuthDisabled} on handlers
 * that must keep passing Origin/CSRF checks even when browser authentication is
 * disabled, rather than being rejected outright by the disabled-mode gate.
 */
export const ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED =
  'knowledgehub:enforce-csrf-when-browser-auth-disabled';

/**
 * Marks a handler as still subject to cookie Origin/CSRF validation when
 * browser authentication is disabled.
 *
 * Applied only to `POST /auth/logout`. A disabled deployment normally rejects
 * every cookie-authenticated unsafe request outright, but logout does not act on
 * the cookie's authority while browser auth is off (it clears cookies and never
 * revokes a session), so it must be able to reach the controller and hand the
 * client a clean state. The normal origin allow-list and the signed
 * double-submit token are still enforced, so this widens nothing else.
 */
export function EnforceCsrfWhenBrowserAuthDisabled(): MethodDecorator {
  return SetMetadata(ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED, true);
}

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
 * deployment cannot accept cookie-authenticated writes without CSRF. The sole
 * exception is a handler marked with
 * {@link EnforceCsrfWhenBrowserAuthDisabled}, which keeps the full Origin/CSRF
 * validation instead of the blanket rejection; only `POST /auth/logout` opts in.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly authConfig: AuthConfig,
    private readonly reflector: Reflector,
  ) {}

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

    const enforceWhenDisabled = this.enforcesCsrfWhenDisabled(context);

    if (!this.authConfig.browserAuthEnabled && !enforceWhenDisabled) {
      throw new ForbiddenException('Browser authentication is disabled');
    }

    const origin = resolveRequestOrigin(request);
    if (!isTrustedOrigin(origin, this.authConfig.trustedOrigins)) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    const csrfSecret = this.authConfig.csrfSecretOrUndefined;
    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = readHeader(request, CSRF_HEADER);

    if (
      csrfSecret === undefined ||
      !verifyCsrfToken(csrfSecret, cookieToken) ||
      !csrfTokensMatch(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }

  private enforcesCsrfWhenDisabled(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(
        ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED,
        [context.getHandler(), context.getClass()],
      ) === true
    );
  }
}

function isBearerAuthenticated(request: Request): boolean {
  return extractBearerToken(request.headers.authorization) !== undefined;
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
