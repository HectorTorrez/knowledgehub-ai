import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Organization feature module.
 *
 * Imports {@link AuthModule} so the route-level {@link SessionGuard} and its
 * token dependencies resolve through the module context. Persistence goes
 * through the globally provided `PrismaService`.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
