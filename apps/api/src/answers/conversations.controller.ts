import {
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
import { ConversationsService } from './conversations.service.js';
import {
  listConversationsSchema,
  type ListConversationsInput,
} from './dto/list-conversations.schema.js';

@Controller('organizations/:organizationId/conversations')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() request: OrganizationRequest,
  ): Promise<ConversationDetailResponse> {
    return this.conversations.create(
      requireOrganizationContext(request).organizationId,
    );
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listConversationsSchema))
    query: ListConversationsInput,
    @Req() request: OrganizationRequest,
  ): Promise<ConversationListResponse> {
    return this.conversations.list(
      requireOrganizationContext(request).organizationId,
      query,
    );
  }

  @Get(':conversationId')
  detail(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<ConversationDetailResponse> {
    return this.conversations.getDetail(
      requireOrganizationContext(request).organizationId,
      conversationId,
    );
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    return this.conversations.delete(
      requireOrganizationContext(request).organizationId,
      conversationId,
    );
  }
}
