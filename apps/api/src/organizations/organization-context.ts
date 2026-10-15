import { InternalServerErrorException } from '@nestjs/common';
import type { OrganizationRole } from '@knowledgehub/shared-types';
import type { AuthenticatedRequest } from '../auth/session.guard.js';

/**
 * Persistence-neutral view of the organization a tenant-scoped request is
 * authorized against. Declared structurally so persistence-only columns cannot
 * leak into a response by being spread in.
 */
export interface AuthorizedOrganization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The tenant authorization context attached to a request after its
 * authenticated user's membership has been verified.
 *
 * Every field is derived server-side: `userId` comes from the session, the
 * organization from the route, and `role` from the membership row. Nothing in
 * this context is ever sourced from client-provided role or organization data.
 */
export interface OrganizationContext {
  organization: AuthorizedOrganization;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}

/**
 * An authenticated request that carries a verified organization context.
 *
 * The context is optional because it is attached by
 * {@link OrganizationMembershipGuard} at runtime; handlers on tenant-scoped
 * routes read it through {@link requireOrganizationContext}.
 */
export interface OrganizationRequest extends AuthenticatedRequest {
  organizationContext?: OrganizationContext;
}

/**
 * Reads the organization context a tenant-scoped route must have been
 * authorized with.
 *
 * Throws `500` when the context is absent: that can only happen if a route was
 * wired without {@link OrganizationMembershipGuard}, which is a programming
 * error rather than a client one, so it must not surface as a `4xx`.
 */
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
