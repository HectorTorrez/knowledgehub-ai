import { KnowledgeGapsController } from './knowledge-gaps.controller.js';
import { KnowledgeGapsService } from './knowledge-gaps.service.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { ActivityModule } from '../activity/activity.module.js';
import { ActivityController } from '../activity/activity.controller.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { InvitationAcceptController } from './invitation-accept.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationTenantController } from './organization-tenant.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuthModule, ActivityModule, EmailModule],
  controllers: [
    KnowledgeGapsController,
    ActivityController,
    InsightsController,
    OrganizationsController,
    OrganizationTenantController,
    InvitationsController,
    InvitationAcceptController,
  ],
  providers: [
    KnowledgeGapsService,
    InsightsService,
    OrganizationsService,
    InvitationsService,
    OrganizationMembershipGuard,
  ],
  exports: [OrganizationMembershipGuard],
})
export class OrganizationsModule {}
