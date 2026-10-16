import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AddMemberResponse,
  MemberListResponse,
  OrganizationDetailResponse,
  UpdateMemberRoleResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  addMemberSchema,
  type AddMemberInput,
} from './dto/add-member.schema.js';
import {
  updateMemberRoleSchema,
  type UpdateMemberRoleInput,
} from './dto/update-member-role.schema.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from './organization-context.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * `SessionGuard` is listed first: Nest runs guards in declaration order, so
 * authentication is resolved before membership.
 */
@Controller('organizations')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class OrganizationTenantController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(':organizationId')
  detail(
    @Req() request: OrganizationRequest,
  ): Promise<OrganizationDetailResponse> {
    return this.organizations.getDetail(requireOrganizationContext(request));
  }

  @Get(':organizationId/members')
  listMembers(@Req() request: OrganizationRequest): Promise<MemberListResponse> {
    return this.organizations.listMembers(
      requireOrganizationContext(request).organizationId,
    );
  }

  /**
   * Adds an existing user, by email, as a `MEMBER`.
   */
  @Post(':organizationId/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Body(new ZodValidationPipe(addMemberSchema)) body: AddMemberInput,
    @Req() request: OrganizationRequest,
  ): Promise<AddMemberResponse> {
    return this.organizations.addMember(
      requireOrganizationContext(request),
      body,
    );
  }

  /**
   * Changes a member's role.
   */
  @Patch(':organizationId/members/:userId')
  @HttpCode(HttpStatus.OK)
  updateMemberRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    body: UpdateMemberRoleInput,
    @Req() request: OrganizationRequest,
  ): Promise<UpdateMemberRoleResponse> {
    return this.organizations.updateMemberRole(
      requireOrganizationContext(request),
      userId,
      body,
    );
  }

  /**
   * Removes a member from the organization. A successful removal is `204 No Content`.
   */
  @Delete(':organizationId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    await this.organizations.removeMember(
      requireOrganizationContext(request),
      userId,
    );
  }
}
