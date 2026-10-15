import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type {
  MemberListResponse,
  OrganizationDetailResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
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
}
