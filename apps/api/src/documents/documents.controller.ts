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
  UseGuards,
} from '@nestjs/common';
import type {
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentUploadUrlResponse,
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
import {
  completeUploadSchema,
  type CompleteUploadInput,
} from './dto/complete-upload.schema.js';
import {
  createUploadUrlSchema,
  type CreateUploadUrlInput,
} from './dto/create-upload-url.schema.js';
import {
  listDocumentsSchema,
  type ListDocumentsInput,
} from './dto/list-documents.schema.js';
import {
  updateDocumentSchema,
  type UpdateDocumentInput,
} from './dto/update-document.schema.js';
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
  list(
    @Query(new ZodValidationPipe(listDocumentsSchema))
    query: ListDocumentsInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentListResponse> {
    return this.documents.list(
      requireOrganizationContext(request).organizationId,
      query,
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

  @Patch(':documentId')
  rename(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodValidationPipe(updateDocumentSchema))
    body: UpdateDocumentInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    return this.documents.rename(
      requireOrganizationContext(request).organizationId,
      documentId,
      body,
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    return this.documents.delete(
      requireOrganizationContext(request).organizationId,
      documentId,
    );
  }

  @Post(':documentId/upload-url')
  @HttpCode(HttpStatus.OK)
  createUploadUrl(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodValidationPipe(createUploadUrlSchema))
    body: CreateUploadUrlInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentUploadUrlResponse> {
    return this.documents.createUploadUrl(
      requireOrganizationContext(request),
      documentId,
      body,
    );
  }

  @Post(':documentId/upload-complete')
  @HttpCode(HttpStatus.OK)
  completeUpload(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodValidationPipe(completeUploadSchema))
    body: CompleteUploadInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    return this.documents.completeUpload(
      requireOrganizationContext(request),
      documentId,
      body,
    );
  }
}
