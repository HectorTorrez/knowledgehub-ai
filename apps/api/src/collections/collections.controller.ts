import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { requireOrganizationContext, type OrganizationRequest } from '../organizations/organization-context.js';
import { OrganizationMembershipGuard } from '../organizations/organization-membership.guard.js';
import { can } from '../organizations/permissions.js';
import { CollectionsService } from './collections.service.js';

const name = z.string().trim().min(1).max(255);
const color = z.string().trim().min(1).max(100);
const createSchema = z.object({ name, color }).strict();
const updateSchema = z.object({ name: name.optional(), color: color.optional() }).strict().refine(value => value.name !== undefined || value.color !== undefined);
const setSchema = z.object({ collectionIds: z.array(z.string().uuid()) }).strict();

function writable(request: OrganizationRequest) {
  const context = requireOrganizationContext(request);
  if (!can(context.role, 'documents.write')) throw new ForbiddenException();
  return context;
}

@Controller('organizations/:organizationId/collections')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(@Req() request: OrganizationRequest) { return this.collections.list(requireOrganizationContext(request).organizationId); }

  @Post()
  create(@Req() request: OrganizationRequest, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) { return this.collections.create(writable(request), body); }

  @Patch(':collectionId')
  update(@Req() request: OrganizationRequest, @Param('collectionId', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>) { return this.collections.update(writable(request), id, body); }

  @Delete(':collectionId')
  @HttpCode(204)
  delete(@Req() request: OrganizationRequest, @Param('collectionId', ParseUUIDPipe) id: string) { return this.collections.delete(writable(request), id); }
}

@Controller('organizations/:organizationId/documents')
@UseGuards(SessionGuard, OrganizationMembershipGuard)
export class DocumentCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Put(':documentId/collections')
  @HttpCode(204)
  set(@Req() request: OrganizationRequest, @Param('documentId', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setSchema)) body: z.infer<typeof setSchema>) { return this.collections.setDocumentCollections(writable(request).organizationId, id, body.collectionIds); }
}
