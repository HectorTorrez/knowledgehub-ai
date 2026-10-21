import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { AggregationService } from './aggregation.service.js';
import {
  contractTotalsSchema,
  type ContractTotalsInput,
} from './dto/contract-totals.schema.js';

@Controller('organizations/:organizationId/aggregates')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class AggregationController {
  constructor(private readonly aggregation: AggregationService) {}

  @Get('contract-totals')
  @UseGuards(RateLimitGuard)
  @RateLimit('search', 'searchUser')
  contractTotals(
    @Query(new ZodValidationPipe(contractTotalsSchema))
    query: ContractTotalsInput,
    @Req() request: OrganizationRequest,
  ): Promise<ContractTotalsResponse> {
    const context = requireOrganizationContext(request);

    return this.aggregation.contractTotals(context.organizationId, query);
  }
}
