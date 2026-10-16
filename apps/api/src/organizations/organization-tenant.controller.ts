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
 * Tenant-scoped organization routes (`/organizations/:organizationId...`).
 *
 * Both guards are applied at the class level so every route added here — now or
 * later — inherits authentication and membership authorization. They are
 * deliberately kept out of {@link OrganizationsController} so organization
 * creation and listing are never subjected to the membership guard.
 *
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
   * Adds an existing user, by email, as a `MEMBER`. Both class-level guards run
   * first (authentication, then membership); the service still revalidates the
   * caller's OWNER role inside the writing transaction. The organization is
   * read from the guarded context and the role is fixed server-side, so neither
   * can be influenced by the request body.
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
   * Changes a member's role. The target is the route `userId`, validated as a
   * UUID so a malformed id is a `400` before it reaches the database, and the
   * organization is read from the guarded context. The class-level guards prove
   * membership only; the service revalidates the caller's OWNER role inside the
   * writing transaction.
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
   * Removes a member from the organization. The target is the route `userId`,
   * validated as a UUID so a malformed id is a `400` before it reaches the
   * database, and the organization is read from the guarded context. The
   * class-level guards prove membership only; the service revalidates the
   * caller's OWNER role inside the writing transaction and enforces the
   * last-owner invariant. A successful removal is `204 No Content`.
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
