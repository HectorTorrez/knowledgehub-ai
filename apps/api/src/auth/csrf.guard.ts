import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SecurityAuditService } from '../audit/security-audit.service.js';
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

export const ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED =
  'knowledgehub:enforce-csrf-when-browser-auth-disabled';

export const SKIP_CSRF = 'knowledgehub:skip-csrf';

export function EnforceCsrfWhenBrowserAuthDisabled(): MethodDecorator {
  return SetMetadata(ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED, true);
}

export function SkipCsrf(): MethodDecorator {
  return SetMetadata(SKIP_CSRF, true);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly authConfig: AuthConfig,
    private readonly reflector: Reflector,
    private readonly audit: SecurityAuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!isUnsafeMethod(request.method)) {
      return true;
    }

    if (this.skipsCsrf(context)) {
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
      this.reject(request, 'browser_auth_disabled', {
        message: 'Browser authentication is disabled',
      });
    }

    const origin = resolveRequestOrigin(request);
    if (!isTrustedOrigin(origin, this.authConfig.trustedOrigins)) {
      this.reject(request, 'untrusted_origin', {
        message: 'Request origin is not allowed',
        origin,
      });
    }

    const csrfSecret = this.authConfig.csrfSecretOrUndefined;
    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = readHeader(request, CSRF_HEADER);

    if (
      csrfSecret === undefined ||
      !verifyCsrfToken(csrfSecret, cookieToken) ||
      !csrfTokensMatch(cookieToken, headerToken)
    ) {
      this.reject(request, 'invalid_token', {
        message: 'Invalid or missing CSRF token',
      });
    }

    return true;
  }

  private reject(
    request: Request,
    reason: string,
    details: { message: string; origin?: string },
  ): never {
    this.audit.record('csrf.rejected', {
      reason,
      method: request.method,
      path: request.path,
      ip: request.ip,
      origin: details.origin,
    });

    throw new ForbiddenException(details.message);
  }

  private enforcesCsrfWhenDisabled(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(
        ENFORCE_CSRF_WHEN_BROWSER_AUTH_DISABLED,
        [context.getHandler(), context.getClass()],
      ) === true
    );
  }

  private skipsCsrf(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
        context.getHandler(),
        context.getClass(),
      ]) === true
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
