import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type {
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
  SessionResponse,
} from '@knowledgehub/shared-types';
import type { Request, Response } from 'express';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
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
import {
  SessionGuard,
  type AuthenticatedRequest,
} from './session.guard.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authConfig: AuthConfig,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit('login')
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
  @UseGuards(RateLimitGuard)
  @RateLimit('login')
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
   * Read-only check of the current cookie-backed session: returns the public
   * profile for a live session. It never rotates tokens or issues cookies.
   */
  @Get('session')
  @UseGuards(SessionGuard)
  async session(
    @Req() request: AuthenticatedRequest,
  ): Promise<SessionResponse> {
    const auth = request.auth;

    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.auth.getSessionUser(auth.userId);

    return { user };
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

    if (this.authConfig.browserAuthEnabled) {
      response.cookie(
        CSRF_COOKIE,
        generateCsrfToken(this.authConfig.csrfSecret),
        buildCsrfCookieOptions(policy, this.authConfig.sessionTtlMs),
      );
    }
  }

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

function readCookie(request: Request, name: string): string | undefined {
  const value = request.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
