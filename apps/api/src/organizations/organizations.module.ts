import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationTenantController } from './organization-tenant.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Organization feature module.
 *
 * Imports {@link AuthModule} so the route-level {@link SessionGuard} and its
 * token dependencies resolve through the module context. Persistence goes
 * through the globally provided `PrismaService`.
 *
 * `OrganizationTenantController` owns the tenant-scoped routes and applies
 * {@link OrganizationMembershipGuard} at the class level; `OrganizationsController`
 * keeps creation and listing, which are deliberately not membership-guarded.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, OrganizationTenantController],
  providers: [OrganizationsService, OrganizationMembershipGuard],
})
export class OrganizationsModule {}
