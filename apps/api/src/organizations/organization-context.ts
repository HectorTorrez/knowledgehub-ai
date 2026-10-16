import { InternalServerErrorException } from '@nestjs/common';
import type { OrganizationRole } from '@knowledgehub/shared-types';
import type { AuthenticatedRequest } from '../auth/session.guard.js';

export interface AuthorizedOrganization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationContext {
  organization: AuthorizedOrganization;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}

export interface OrganizationRequest extends AuthenticatedRequest {
  organizationContext?: OrganizationContext;
}

export function requireOrganizationContext(
  request: OrganizationRequest,
): OrganizationContext {
  const context = request.organizationContext;

  if (!context) {
    throw new InternalServerErrorException(
      'Organization context is unavailable for this request',
    );
  }

  return context;
}
