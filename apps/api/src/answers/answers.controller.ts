import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  type OrganizationContext,
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
    @Res() response: Response,
  ): Promise<void> {
    const context = requireOrganizationContext(request);

    if (!body.stream) {
      const result: AnswerResponse = await this.answers.answer(
        context.organizationId,
        context.userId,
        body.question,
        body.conversationId,
        body.documentId,
      );

      response.json(result);
      return;
    }

    await this.streamAnswer(context, body, request, response);
  }

  private async streamAnswer(
    context: OrganizationContext,
    body: AnswerQuestionInput,
    request: OrganizationRequest,
    response: Response,
  ): Promise<void> {
    const abort = new AbortController();
    const onAbort = () => {
      if (!response.writableEnded) {
        abort.abort();
      }
    };

    request.on('aborted', onAbort);
    response.on('close', onAbort);
    response.on('error', onAbort);

    const events = this.answers.answerStream(
      context.organizationId,
      context.userId,
      body.question,
      body.conversationId,
      body.documentId,
      abort.signal,
    );

    let started = false;
    const start = () => {
      started = true;
      response.status(HttpStatus.OK);
      response.setHeader(
        'Content-Type',
        'application/x-ndjson; charset=utf-8',
      );
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
    };

    try {
      for await (const event of events) {
        if (!started) {
          start();
        }

        response.write(`${JSON.stringify(event)}\n`);
      }

      if (!started) {
        start();
      }

      response.end();
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }

      if (!started) {
        throw error;
      }

      response.write(
        `${JSON.stringify({
          type: 'error',
          message:
            error instanceof HttpException
              ? error.message
              : 'The answer stream failed',
        })}\n`,
      );
      response.end();
    } finally {
      request.off('aborted', onAbort);
      response.off('close', onAbort);
      response.off('error', onAbort);
    }
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
