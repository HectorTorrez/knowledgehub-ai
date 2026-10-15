import { Injectable } from '@nestjs/common';
import type {
  OrganizationDetailResponse,
  OrganizationListResponse,
  OrganizationRole,
  OrganizationSummary,
} from '@knowledgehub/shared-types';
import { MembershipRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrganizationInput } from './dto/create-organization.schema.js';

/**
 * The subset of an organization row the HTTP contract exposes. Declared
 * structurally so persistence-only columns cannot leak into a response by
 * being spread in.
 */
interface OrganizationRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

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
}

/** Maps a persisted organization plus the caller's role to the public shape. */
function toOrganizationSummary(
  organization: OrganizationRecord,
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
