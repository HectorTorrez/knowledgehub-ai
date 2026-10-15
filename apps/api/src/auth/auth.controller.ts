import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
} from '@knowledgehub/shared-types';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth.config.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  buildAccessCookieOptions,
  buildClearAccessCookieOptions,
  buildClearRefreshCookieOptions,
  buildRefreshCookieOptions,
} from './cookies.js';
import { EnforceCsrfWhenBrowserAuthDisabled } from './csrf.guard.js';
import {
  CSRF_COOKIE,
  buildClearCsrfCookieOptions,
  buildCsrfCookieOptions,
  generateCsrfToken,
} from './csrf.js';
import { loginSchema, type LoginInput } from './dto/login.schema.js';
import { registerSchema, type RegisterInput } from './dto/register.schema.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authConfig: AuthConfig,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegisterResponse> {
    const result = await this.auth.register(body, {
      userAgent: request.get('user-agent') ?? undefined,
      ipAddress: request.ip,
    });

    this.issueAuthCookies(response, result);

    return { user: result.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body, {
      userAgent: request.get('user-agent') ?? undefined,
      ipAddress: request.ip,
    });

    this.issueAuthCookies(response, result);

    return { user: result.user };
  }

  /**
   * Rotates the refresh token carried in the refresh cookie and replaces all
   * auth cookies. The response body carries only the public profile; the new
   * tokens travel as cookies.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    const result = await this.auth.refresh(
      readCookie(request, REFRESH_TOKEN_COOKIE),
    );

    this.issueAuthCookies(response, result);

    return { user: result.user };
  }

  /**
   * Revokes the current device session (when the refresh cookie identifies it)
   * and clears every auth cookie. Always 204 and idempotent: logging out twice,
   * or without a usable cookie, still clears cookies and never fails. It does
   * not require an access token, so it works after the access token expires.
   *
   * `@EnforceCsrfWhenBrowserAuthDisabled` keeps a cookie-authenticated logout
   * reachable when browser authentication is disabled: instead of the guard's
   * blanket rejection, the normal trusted-Origin and CSRF checks still apply.
   * The service ignores the refresh cookie while browser auth is off, so this
   * clears the client without revoking a session through an untrusted cookie.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @EnforceCsrfWhenBrowserAuthDisabled()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request, REFRESH_TOKEN_COOKIE));
    this.clearAuthCookies(response);
  }

  /**
   * Delivers credentials as cookies only; the response body carries the public
   * profile. Cookies are set after the login/registration/rotation transaction
   * has committed, so a failed attempt never hands out credentials. The CSRF
   * cookie is issued only when browser authentication is enabled.
   */
  private issueAuthCookies(response: Response, result: AuthResult): void {
    const policy = this.authConfig.cookiePolicy;
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      buildAccessCookieOptions(policy, this.authConfig.accessTtlMs),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshCookieOptions(
        policy,
        result.refreshTokenMaxAgeMs ?? this.authConfig.refreshTtlMs,
      ),
    );

    // Signed double-submit token, readable by the SPA so it can echo the value
    // back in the `X-CSRF-Token` header on unsafe requests.
    if (this.authConfig.browserAuthEnabled) {
      response.cookie(
        CSRF_COOKIE,
        generateCsrfToken(this.authConfig.csrfSecret),
        buildCsrfCookieOptions(policy, this.authConfig.sessionTtlMs),
      );
    }
  }

  /**
   * Clears every auth cookie with the same path and security attributes used to
   * set them, so the browser actually removes them. Runs regardless of browser
   * authentication so logout always leaves a clean client.
   */
  private clearAuthCookies(response: Response): void {
    const policy = this.authConfig.cookiePolicy;
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
}

/** Reads a cookie value, tolerating missing or non-string values. */
function readCookie(request: Request, name: string): string | undefined {
  const value = request.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
