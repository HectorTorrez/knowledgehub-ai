import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { fetchDocumentUrl } from './url-fetcher.js';
import { URL_FETCHER } from './url-fetcher.token.js';

@Module({
  imports: [ActivityModule, AuthModule, OrganizationsModule, StorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    { provide: URL_FETCHER, useValue: fetchDocumentUrl },
  ],
})
export class DocumentsModule {}
