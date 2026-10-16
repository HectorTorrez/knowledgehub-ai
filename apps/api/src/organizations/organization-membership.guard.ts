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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
