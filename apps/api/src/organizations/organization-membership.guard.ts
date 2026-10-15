import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationRequest } from './organization-context.js';

/**
 * RFC 4122 textual UUID (any version), matched case-insensitively. Used to
 * reject malformed route parameters before they reach the database.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes access to a tenant-scoped organization route.
 *
 * Runs only after {@link SessionGuard} has populated `request.auth`; the guard
 * order is declared as `@UseGuards(SessionGuard, OrganizationMembershipGuard)`
 * so authentication always precedes membership resolution.
 *
 * The sole source of the organization is the route parameter, and the sole
 * source of identity is the session. Membership is read from the database on
 * every request and never cached, so revoking a membership takes effect on the
 * next request rather than when the access token expires.
 *
 * Failure modes:
 * - no authenticated context → `401`
 * - missing or malformed organization id → `400`
 * - no membership for the authenticated user → `403` (also for a nonexistent
 *   organization, so the endpoint does not reveal which organizations exist)
 */
@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();

    const auth = request.auth;
    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    const organizationId = request.params?.organizationId;
    if (
      typeof organizationId !== 'string' ||
      !UUID_PATTERN.test(organizationId)
    ) {
      throw new BadRequestException('organizationId must be a valid UUID');
    }

    // Scoped by both the session user and the route organization. The
    // compound lookup cannot be satisfied by client-supplied role or
    // organization data, and the result is not cached.
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: auth.userId, organizationId },
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }

    request.organizationContext = {
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        createdAt: membership.organization.createdAt,
        updatedAt: membership.organization.updatedAt,
      },
    };

    return true;
  }
}
