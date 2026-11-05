import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type {
  AcceptInvitationResponse,
  AcceptInvitationWithNewAccountResponse,
  InvitationPreviewResponse,
} from '@knowledgehub/shared-types';
import type { Request, Response } from 'express';
import { issueAuthCookies } from '../auth/auth-cookies.js';
import { AuthConfig } from '../auth/auth.config.js';
import { SkipCsrf } from '../auth/csrf.guard.js';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import {
  acceptInvitationSchema,
  acceptInvitationWithNewAccountSchema,
  type AcceptInvitationInput,
  type AcceptInvitationWithNewAccountInput,
} from './dto/accept-invitation.schema.js';
import { InvitationsService } from './invitations.service.js';

@Controller('invitations')
export class InvitationAcceptController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly authConfig: AuthConfig,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @UseGuards(RateLimitGuard)
  @RateLimit('login')
  preview(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationInput,
  ): Promise<InvitationPreviewResponse> {
    return this.invitations.preview(body.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<AcceptInvitationResponse> {
    const userId = request.auth?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.invitations.accept(userId, body.token);
  }

  @Post('accept-new-account')
  @HttpCode(HttpStatus.CREATED)
  @SkipCsrf()
  @UseGuards(RateLimitGuard)
  @RateLimit('login', 'registerHourly')
  async acceptWithNewAccount(
    @Body(new ZodValidationPipe(acceptInvitationWithNewAccountSchema))
    body: AcceptInvitationWithNewAccountInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AcceptInvitationWithNewAccountResponse> {
    const result = await this.invitations.acceptWithNewAccount(body, {
      userAgent: request.get('user-agent') ?? undefined,
      ipAddress: request.ip,
    });

    issueAuthCookies(response, this.authConfig, result);

    return { user: result.user, organizationId: result.organizationId };
  }
}
