import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InvitationAcceptController } from './invitation-accept.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationTenantController } from './organization-tenant.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    OrganizationsController,
    OrganizationTenantController,
    InvitationsController,
    InvitationAcceptController,
  ],
  providers: [
    OrganizationsService,
    InvitationsService,
    OrganizationMembershipGuard,
  ],
  exports: [OrganizationMembershipGuard],
})
export class OrganizationsModule {}
