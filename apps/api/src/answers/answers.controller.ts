import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AnswerDetailResponse,
  AnswerListResponse,
  AnswerResponse,
} from '@knowledgehub/shared-types';
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
import {
  listAnswersSchema,
  type ListAnswersInput,
} from './dto/list-answers.schema.js';
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

  @Get()
  list(
    @Query(new ZodValidationPipe(listAnswersSchema))
    query: ListAnswersInput,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerListResponse> {
    return this.answers.list(
      requireOrganizationContext(request).organizationId,
      query,
    );
  }

  @Get(':answerId')
  detail(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerDetailResponse> {
    return this.answers.getDetail(
      requireOrganizationContext(request).organizationId,
      answerId,
    );
  }

  @Delete(':answerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    return this.answers.delete(
      requireOrganizationContext(request).organizationId,
      answerId,
    );
  }
}
