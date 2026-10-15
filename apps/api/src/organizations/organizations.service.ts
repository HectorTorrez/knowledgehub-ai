import { Injectable } from '@nestjs/common';
import type {
  MemberListResponse,
  OrganizationDetailResponse,
  OrganizationListResponse,
  OrganizationRole,
  OrganizationSummary,
} from '@knowledgehub/shared-types';
import { MembershipRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrganizationInput } from './dto/create-organization.schema.js';
import type {
  AuthorizedOrganization,
  OrganizationContext,
} from './organization-context.js';

/** Creates organizations and lists the organizations a user belongs to. */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an organization and the caller's OWNER membership atomically. The
   * user ID is supplied by the caller (derived from the session), never from
   * the request body. If either write fails the transaction rolls back, so an
   * organization is never left without its owner.
   */
  async create(
    userId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDetailResponse> {
    const { organization, role } = await this.prisma.$transaction(
      async (tx) => {
        const organization = await tx.organization.create({
          data: { name: input.name },
        });

        const membership = await tx.membership.create({
          data: {
            userId,
            organizationId: organization.id,
            role: MembershipRole.OWNER,
          },
        });

        return { organization, role: membership.role };
      },
    );

    return { organization: toOrganizationSummary(organization, role) };
  }

  /**
   * Lists the organizations the user belongs to, scoped to the user's own
   * membership rows so no other tenant's data can be returned. Ordering is
   * deterministic: organization creation time, then organization id.
   */
  async listForUser(userId: string): Promise<OrganizationListResponse> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: [
        { organization: { createdAt: 'asc' } },
        { organizationId: 'asc' },
      ],
    });

    return {
      organizations: memberships.map((membership) =>
        toOrganizationSummary(membership.organization, membership.role),
      ),
    };
  }

  /**
   * Returns the detail of the organization the caller has already been
   * authorized against. The organization and the caller's role both come from
   * the guard-verified {@link OrganizationContext}, never from request input.
   */
  async getDetail(
    context: OrganizationContext,
  ): Promise<OrganizationDetailResponse> {
    return {
      organization: toOrganizationSummary(context.organization, context.role),
    };
  }

  /**
   * Lists the members of the authorized organization. Scoped strictly to
   * `organizationId`, which the guard derived from the route after verifying
   * membership.
   *
   * Each row selects only the user fields the public contract exposes and maps
   * them explicitly, so password hashes, session data and other internal fields
   * cannot leak. Ordering is deterministic: membership creation time, then user
   * id.
   */
  async listMembers(organizationId: string): Promise<MemberListResponse> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });

    return {
      members: memberships.map((membership) => ({
        userId: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      })),
    };
  }
}

/** Maps a persisted organization plus the caller's role to the public shape. */
function toOrganizationSummary(
  organization: AuthorizedOrganization,
  role: OrganizationRole,
): OrganizationSummary {
  return {
    id: organization.id,
    name: organization.name,
    role,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}
