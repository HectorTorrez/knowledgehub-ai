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
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type {
  AnswerDetailResponse,
  AnswerFeedbackResponse,
  AnswerListResponse,
  AnswerResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import { toAnswerNdjsonStream } from './answer-stream.js';
import {
  answerQuestionSchema,
  type AnswerQuestionInput,
} from './dto/answer-question.schema.js';
import {
  listAnswersSchema,
  type ListAnswersInput,
} from './dto/list-answers.schema.js';
import {
  setAnswerFeedbackSchema,
  type SetAnswerFeedbackInput,
} from './dto/set-answer-feedback.schema.js';
import { AnswersService } from './answers.service.js';

@Controller('organizations/:organizationId/answers')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('answerUser', 'answerTenant')
  async answer(
    @Body(new ZodValidationPipe(answerQuestionSchema))
    body: AnswerQuestionInput,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerResponse | StreamableFile> {
    const context = requireOrganizationContext(request);

    const result = await this.answers.answer(
      context.organizationId,
      context.userId,
      body.question,
      body.conversationId,
      body.documentId,
    );

    if (body.stream) {
      return toAnswerNdjsonStream(result);
    }

    return result;
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listAnswersSchema))
    query: ListAnswersInput,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerListResponse> {
    const context = requireOrganizationContext(request);

    return this.answers.list(context.organizationId, context.userId, query);
  }

  @Get(':answerId')
  detail(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerDetailResponse> {
    const context = requireOrganizationContext(request);

    return this.answers.getDetail(
      context.organizationId,
      answerId,
      context.userId,
    );
  }

  @Put(':answerId/feedback')
  @HttpCode(HttpStatus.OK)
  setFeedback(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Body(new ZodValidationPipe(setAnswerFeedbackSchema))
    body: SetAnswerFeedbackInput,
    @Req() request: OrganizationRequest,
  ): Promise<AnswerFeedbackResponse> {
    const context = requireOrganizationContext(request);

    return this.answers.setFeedback(
      context.organizationId,
      answerId,
      context.userId,
      body,
    );
  }

  @Delete(':answerId/feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearFeedback(
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    const context = requireOrganizationContext(request);

    return this.answers.clearFeedback(
      context.organizationId,
      answerId,
      context.userId,
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
