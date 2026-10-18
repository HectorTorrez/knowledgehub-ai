import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, RetrievalModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
