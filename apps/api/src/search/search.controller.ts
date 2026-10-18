import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { SearchResponse } from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import { searchSchema, type SearchInput } from './dto/search.schema.js';
import { SearchService } from './search.service.js';

@Controller('organizations/:organizationId/search')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit('search')
  search(
    @Query(new ZodValidationPipe(searchSchema))
    query: SearchInput,
    @Req() request: OrganizationRequest,
  ): Promise<SearchResponse> {
    return this.searchService.search(
      requireOrganizationContext(request).organizationId,
      query,
    );
  }
}
