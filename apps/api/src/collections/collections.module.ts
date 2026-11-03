import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import {
  CollectionsController,
  DocumentCollectionsController,
} from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

@Module({
  imports: [ActivityModule, AuthModule, OrganizationsModule],
  controllers: [CollectionsController, DocumentCollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
