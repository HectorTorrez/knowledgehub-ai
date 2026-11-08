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
  DocumentDownloadUrlResponse,
  DocumentListResponse,
  DocumentUploadUrlResponse,
} from '@knowledgehub/shared-types';
import { ForbiddenException } from '@nestjs/common';
import { can, type Capability } from '../organizations/permissions.js';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
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
import { importUrlSchema, type ImportUrlInput } from './dto/import-url.schema.js';
import { DocumentsService } from './documents.service.js';

function requireDocumentCapability(
  request: OrganizationRequest,
  capability: Capability,
): void {
  if (!can(requireOrganizationContext(request).role, capability))
    throw new ForbiddenException();
}

@Controller('organizations/:organizationId/documents')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit('documentWriteUser')
  create(
    @Body(new ZodValidationPipe(createDocumentSchema))
    body: CreateDocumentInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    requireDocumentCapability(request, 'documents.write');
    return this.documents.create(requireOrganizationContext(request), body);
  }

  @Post('import-url')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit('documentWriteUser')
  importUrl(
    @Body(new ZodValidationPipe(importUrlSchema)) body: ImportUrlInput,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    requireDocumentCapability(request, 'documents.write');
    return this.documents.importFromUrl(requireOrganizationContext(request), body);
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

  @Get(':documentId/download')
  download(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDownloadUrlResponse> {
    return this.documents.createDownloadUrl(
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
    requireDocumentCapability(request, 'documents.write');
    return this.documents.rename(
      requireOrganizationContext(request).organizationId,
      documentId,
      body,
      requireOrganizationContext(request).userId,
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    requireDocumentCapability(request, 'documents.delete');
    return this.documents.delete(
      requireOrganizationContext(request).organizationId,
      documentId,
      requireOrganizationContext(request).userId,
    );
  }

  @Post(':documentId/reprocess')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('documentWriteUser')
  reprocess(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: OrganizationRequest,
  ): Promise<DocumentDetailResponse> {
    requireDocumentCapability(request, 'documents.write');
    return this.documents.reprocess(
      requireOrganizationContext(request).organizationId,
      documentId,
      requireOrganizationContext(request).userId,
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
    requireDocumentCapability(request, 'documents.write');
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
    requireDocumentCapability(request, 'documents.write');
    return this.documents.completeUpload(
      requireOrganizationContext(request),
      documentId,
      body,
    );
  }
}
