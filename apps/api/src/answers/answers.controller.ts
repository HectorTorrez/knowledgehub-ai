import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AnswerResponse } from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import {
  answerQuestionSchema,
  type AnswerQuestionInput,
} from './dto/answer-question.schema.js';
import { AnswersService } from './answers.service.js';

@Controller('organizations/:organizationId/answers')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  answer(
    @Body(new ZodValidationPipe(answerQuestionSchema))
    body: AnswerQuestionInput,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerResponse> {
    const context = requireOrganizationContext(request);

    return this.answers.answer(
      context.organizationId,
      context.userId,
      body.question,
    );
  }
}
