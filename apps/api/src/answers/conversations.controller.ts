import type { Response } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  ConversationDetailResponse,
  ConversationListResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import { can } from '../organizations/permissions.js';
import {
  exportFilename,
  renderConversationMarkdown,
} from './conversation-markdown.js';
import {
  ConversationsService,
  type ConversationScope,
} from './conversations.service.js';
import {
  listConversationsSchema,
  type ListConversationsInput,
} from './dto/list-conversations.schema.js';
import {
  updateConversationSchema,
  type UpdateConversationInput,
} from './dto/update-conversation.schema.js';

export function conversationScope(
  request: OrganizationRequest,
): ConversationScope {
  const context = requireOrganizationContext(request);
  return {
    organizationId: context.organizationId,
    actor: {
      userId: context.userId,
      canManageMembers: can(context.role, 'members.manage'),
    },
  };
}

@Controller('organizations/:organizationId/conversations')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() request: OrganizationRequest,
  ): Promise<ConversationDetailResponse> {
    return this.conversations.create(conversationScope(request));
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listConversationsSchema))
    query: ListConversationsInput,
    @Req() request: OrganizationRequest,
  ): Promise<ConversationListResponse> {
    return this.conversations.list(conversationScope(request), query);
  }

  @Get(':conversationId')
  detail(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<ConversationDetailResponse> {
    return this.conversations.getDetail(
      conversationScope(request),
      conversationId,
    );
  }

  @Patch(':conversationId')
  update(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(updateConversationSchema))
    body: UpdateConversationInput,
    @Req() request: OrganizationRequest,
  ): Promise<ConversationDetailResponse> {
    return this.conversations.setVisibility(
      conversationScope(request),
      conversationId,
      body.visibility,
    );
  }

  @Get(':conversationId/export')
  async exportConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() request: OrganizationRequest,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.conversations.getExport(
      conversationScope(request),
      conversationId,
    );
    const date = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFilename(data.title, date)}"`,
    );
    response.send(renderConversationMarkdown(data, date));
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    return this.conversations.delete(conversationScope(request), conversationId);
  }
}
