import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from './organization-context.js';
import { InsightsService } from './insights.service.js';

const insightsQuery = z
  .object({ days: z.enum(['7', '30', '90']).default('30') })
  .strict();

@Controller('organizations/:organizationId/insights')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(insightsQuery))
    query: z.infer<typeof insightsQuery>,
    @Req() request: OrganizationRequest,
  ) {
    return this.insights.get(
      requireOrganizationContext(request),
      Number(query.days),
    );
  }
}
