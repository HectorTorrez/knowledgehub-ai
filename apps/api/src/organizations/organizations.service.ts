import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddMemberResponse,
  MemberListResponse,
  OrganizationDetailResponse,
  OrganizationListResponse,
  OrganizationRole,
  OrganizationSummary,
} from '@knowledgehub/shared-types';
import { MembershipRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import type { AddMemberInput } from './dto/add-member.schema.js';
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

  /**
   * Adds an existing user, identified by email, as a `MEMBER` of the authorized
   * organization.
   *
   * The actor's OWNER role is re-read and enforced *inside* the same
   * transaction that writes the membership. The route guard already resolved
   * the caller's membership, but that check ran before this method: a role or
   * membership that changed in between must not authorize the write, so the
   * permission is revalidated transactionally rather than trusted from the
   * request context. The role check runs before the target lookup so a
   * non-owner cannot use the error to probe which emails are registered.
   *
   * The organization comes from the guarded context (which derives it from the
   * route) and the role is hard-coded to `MEMBER`; neither is accepted from the
   * request body. Duplicate membership is caught from the database's unique
   * constraint and surfaced as a `409` without leaking the underlying error.
   */
  async addMember(
    context: OrganizationContext,
    input: AddMemberInput,
  ): Promise<AddMemberResponse> {
    const email = normalizeEmail(input.email);

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const actor = await tx.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: context.userId,
              organizationId: context.organizationId,
            },
          },
          select: { role: true },
        });

        if (!actor || actor.role !== MembershipRole.OWNER) {
          throw new ForbiddenException(
            'Only an organization owner can add members',
          );
        }

        const user = await tx.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        if (!user) {
          throw new NotFoundException(
            'No user found with this email address',
          );
        }

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: context.organizationId,
            role: MembershipRole.MEMBER,
          },
          select: { role: true, createdAt: true },
        });

        return {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: membership.role,
          createdAt: membership.createdAt.toISOString(),
        };
      });

      return { member };
    } catch (error) {
      if (isDuplicateMembershipViolation(error)) {
        throw new ConflictException(
          'User is already a member of this organization',
        );
      }
      throw error;
    }
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

/**
 * True only for a unique-constraint violation on the membership join key
 * (`[userId, organizationId]`).
 *
 * Scoped narrowly, mirroring {@link isUniqueEmailViolation}: a unique violation
 * elsewhere (for example on `User.email`) must surface as an internal error
 * rather than a misleading "already a member" `409`.
 */
export function isDuplicateMembershipViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta as
    | { modelName?: string; target?: unknown }
    | undefined;

  if (meta?.modelName === 'Membership') {
    return true;
  }

  const target = Array.isArray(meta?.target) ? meta.target.map(String) : [];
  return (
    target.includes('userId') && target.includes('organizationId')
  );
}
