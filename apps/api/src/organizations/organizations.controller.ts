import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  OrganizationDetailResponse,
  OrganizationListResponse,
} from '@knowledgehub/shared-types';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from './dto/create-organization.schema.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    body: CreateOrganizationInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrganizationDetailResponse> {
    return this.organizations.create(request.auth!.userId, body);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
  ): Promise<OrganizationListResponse> {
    return this.organizations.listForUser(request.auth!.userId);
  }
}
