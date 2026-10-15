import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { RegisterResponse } from '@knowledgehub/shared-types';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from './cookies.js';
import {
  CSRF_COOKIE,
  buildCsrfCookieOptions,
  generateCsrfToken,
} from './csrf.js';
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

    // Tokens are delivered as cookies only; the body carries the public profile.
    // Cookies are set after the transaction has committed, so a failed
    // registration never hands out credentials.
    const policy = this.authConfig.cookiePolicy;
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      buildAccessCookieOptions(policy, this.authConfig.accessTtlMs),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshCookieOptions(policy, this.authConfig.refreshTtlMs),
    );

    // Signed double-submit token, readable by the SPA so it can echo the value
    // back in the `X-CSRF-Token` header on unsafe requests. Only issued when
    // browser authentication is enabled.
    if (this.authConfig.browserAuthEnabled) {
      response.cookie(
        CSRF_COOKIE,
        generateCsrfToken(this.authConfig.csrfSecret),
        buildCsrfCookieOptions(policy, this.authConfig.sessionTtlMs),
      );
    }

    return { user: result.user };
  }
}
