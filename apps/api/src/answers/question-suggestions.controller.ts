import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { QuestionSuggestionsResponse } from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import {
  questionSuggestionsSchema,
  type QuestionSuggestionsInput,
} from './dto/question-suggestions.schema.js';
import { QuestionSuggestionsService } from './question-suggestions.service.js';

@Controller('organizations/:organizationId')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class QuestionSuggestionsController {
  constructor(private readonly suggestions: QuestionSuggestionsService) {}

  @Get('question-suggestions')
  async starters(
    @Query(new ZodValidationPipe(questionSuggestionsSchema))
    query: QuestionSuggestionsInput,
    @Req() request: OrganizationRequest,
  ): Promise<QuestionSuggestionsResponse> {
    const context = requireOrganizationContext(request);

    return {
      questions: await this.suggestions.starters(
        context.organizationId,
        query.locale,
      ),
    };
  }

  @Get('answers/:answerId/follow-ups')
  async followUps(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Req() request: OrganizationRequest,
  ): Promise<QuestionSuggestionsResponse> {
    const context = requireOrganizationContext(request);

    return {
      questions: await this.suggestions.followUps(
        context.organizationId,
        answerId,
        context.userId,
      ),
    };
  }
}
