import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationTenantController } from './organization-tenant.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, OrganizationTenantController],
  providers: [OrganizationsService, OrganizationMembershipGuard],
})
export class OrganizationsModule {}
