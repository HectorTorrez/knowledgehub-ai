import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from './organization-context.js';
import { KnowledgeGapsService } from './knowledge-gaps.service.js';

const updateGapSchema = z
  .object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
    assigneeId: z.uuid().nullable(),
    documentId: z.uuid().nullable(),
  })
  .strict();

@Controller('organizations/:organizationId/knowledge-gaps')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class KnowledgeGapsController {
  constructor(private readonly gaps: KnowledgeGapsService) {}

  @Get()
  list(@Req() request: OrganizationRequest) {
    return this.gaps.list(requireOrganizationContext(request));
  }

  @Put(':answerId')
  @HttpCode(204)
  save(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Body(new ZodValidationPipe(updateGapSchema))
    body: z.infer<typeof updateGapSchema>,
    @Req() request: OrganizationRequest,
  ) {
    return this.gaps.save(requireOrganizationContext(request), answerId, body);
  }
}
