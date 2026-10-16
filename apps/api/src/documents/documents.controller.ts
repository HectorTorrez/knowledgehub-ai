import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  DocumentDetailResponse,
  DocumentListResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import {
  requireOrganizationContext,
  type OrganizationRequest,
} from '../organizations/organization-context.js';
import {
  createDocumentSchema,
  type CreateDocumentInput,
} from './dto/create-document.schema.js';
import { DocumentsService } from './documents.service.js';

@Controller('organizations/:organizationId/documents')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createDocumentSchema))
    body: CreateDocumentInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    return this.documents.create(requireOrganizationContext(request), body);
  }

  @Get()
  list(@Req() request: OrganizationRequest): Promise<DocumentListResponse> {
    return this.documents.list(
      requireOrganizationContext(request).organizationId,
    );
  }

  @Get(':documentId')
  detail(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    return this.documents.getDetail(
      requireOrganizationContext(request).organizationId,
      documentId,
    );
  }
}
