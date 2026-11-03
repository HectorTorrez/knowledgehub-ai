import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { requireOrganizationContext, type OrganizationRequest } from '../organizations/organization-context.js';
import { OrganizationActivityAction } from '../generated/prisma/client.js';
import { ActivityService } from './activity.service.js';

const listActivitySchema = z.object({
  action: z.string().transform((value) => value.split(',')).pipe(z.array(z.enum(OrganizationActivityAction)).min(1)).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

@Controller('organizations/:organizationId/activity')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@Req() request: OrganizationRequest, @Query(new ZodValidationPipe(listActivitySchema)) query: z.infer<typeof listActivitySchema>) {
    return this.activity.list(requireOrganizationContext(request), query);
  }
}
