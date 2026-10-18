import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AcceptInvitationResponse } from '@knowledgehub/shared-types';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
} from './dto/accept-invitation.schema.js';
import { InvitationsService } from './invitations.service.js';

@Controller('invitations')
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationsService) {}

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
}
