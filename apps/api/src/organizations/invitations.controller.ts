import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateInvitationResponse,
  InvitationListResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  createInvitationSchema,
  type CreateInvitationInput,
} from './dto/create-invitation.schema.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from './organization-context.js';
import { InvitationsService } from './invitations.service.js';

@Controller('organizations/:organizationId/invitations')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createInvitationSchema))
    body: CreateInvitationInput,
    @Req() request: OrganizationRequest,
  ): Promise<CreateInvitationResponse> {
    return this.invitations.create(
      requireOrganizationContext(request),
      body.email,
    );
  }

  @Get()
  list(@Req() request: OrganizationRequest): Promise<InvitationListResponse> {
    return this.invitations.list(requireOrganizationContext(request));
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    return this.invitations.revoke(
      requireOrganizationContext(request),
      invitationId,
    );
  }
}
