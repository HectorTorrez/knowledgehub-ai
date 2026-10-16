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
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  UpdateMemberRoleResponse,
} from '@knowledgehub/shared-types';
import { MembershipRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import type { AddMemberInput } from './dto/add-member.schema.js';
import type { CreateOrganizationInput } from './dto/create-organization.schema.js';
import type { UpdateMemberRoleInput } from './dto/update-member-role.schema.js';
import type {
  AuthorizedOrganization,
  OrganizationContext,
} from './organization-context.js';

const MEMBERSHIP_USER_ORGANIZATION_CONSTRAINT =
  'Membership_userId_organizationId_key';

/**
 * READ COMMITTED is PostgreSQL's default and is what the organization-row lock
 * protocol relies on: a `FOR UPDATE` that blocks behind another transaction
 * re-reads the committed row (and, for later statements, the committed
 * memberships) once the lock is released.
 */
const MEMBERSHIP_MUTATION_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

const MEMBER_PROJECTION = {
  role: true,
  createdAt: true,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} as const;

/**
 * Raw SQL is required because Prisma exposes no typed `SELECT ... FOR UPDATE`
 * API.
 */
export async function lockOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE
  `;

  if (locked.length === 0) {
    throw new NotFoundException('Organization not found');
  }
}

export async function requireOwner(
  tx: Prisma.TransactionClient,
  context: Pick<OrganizationContext, 'userId' | 'organizationId'>,
  action: string,
): Promise<void> {
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
    throw new ForbiddenException(`Only an organization owner can ${action}`);
  }
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getDetail(
    context: OrganizationContext,
  ): Promise<OrganizationDetailResponse> {
    return {
      organization: toOrganizationSummary(context.organization, context.role),
    };
  }

  async listMembers(organizationId: string): Promise<MemberListResponse> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      select: MEMBER_PROJECTION,
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });

    return { members: memberships.map(toOrganizationMember) };
  }

  async addMember(
    context: OrganizationContext,
    input: AddMemberInput,
  ): Promise<AddMemberResponse> {
    const email = normalizeEmail(input.email);

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        await lockOrganization(tx, context.organizationId);
        await requireOwner(tx, context, 'add members');

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

        return toOrganizationMember({
          role: membership.role,
          createdAt: membership.createdAt,
          user,
        });
      }, MEMBERSHIP_MUTATION_TRANSACTION);

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

  async updateMemberRole(
    context: OrganizationContext,
    targetUserId: string,
    input: UpdateMemberRoleInput,
  ): Promise<UpdateMemberRoleResponse> {
    const member = await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await requireOwner(tx, context, 'change member roles');

      const target = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: context.organizationId,
          },
        },
        select: MEMBER_PROJECTION,
      });

      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === input.role) {
        return toOrganizationMember(target);
      }

      if (
        target.role === MembershipRole.OWNER &&
        input.role === MembershipRole.MEMBER
      ) {
        const ownerCount = await tx.membership.count({
          where: {
            organizationId: context.organizationId,
            role: MembershipRole.OWNER,
          },
        });

        if (ownerCount <= 1) {
          throw new ConflictException(
            'Organization must have at least one owner',
          );
        }
      }

      const updated = await tx.membership.update({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: context.organizationId,
          },
        },
        data: { role: input.role },
        select: MEMBER_PROJECTION,
      });

      return toOrganizationMember(updated);
    }, MEMBERSHIP_MUTATION_TRANSACTION);

    return { member };
  }

  async removeMember(
    context: OrganizationContext,
    targetUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await requireOwner(tx, context, 'remove members');

      const target = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: context.organizationId,
          },
        },
        select: { role: true },
      });

      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === MembershipRole.OWNER) {
        const ownerCount = await tx.membership.count({
          where: {
            organizationId: context.organizationId,
            role: MembershipRole.OWNER,
          },
        });

        if (ownerCount <= 1) {
          throw new ConflictException(
            'Organization must have at least one owner',
          );
        }
      }

      await tx.membership.delete({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: context.organizationId,
          },
        },
      });
    }, MEMBERSHIP_MUTATION_TRANSACTION);
  }
}

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

interface MemberProjection {
  role: OrganizationRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

function toOrganizationMember(membership: MemberProjection): OrganizationMember {
  return {
    userId: membership.user.id,
    email: membership.user.email,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
  };
}

/**
 * With `@prisma/adapter-pg` (this project) Prisma does not populate `target`;
 * the driver reports the violating table as `driverAdapterError.cause.table`
 * and the unique index as `driverAdapterError.cause.constraint.index`.
 */
interface UniqueViolationMeta {
  modelName?: string;
  target?: unknown;
  driverAdapterError?: {
    cause?: {
      table?: string;
      constraint?: { index?: string };
    };
  };
}

export function isDuplicateMembershipViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta as UniqueViolationMeta | undefined;
  if (!meta) {
    return false;
  }

  const cause = meta.driverAdapterError?.cause;
  if (cause) {
    return (
      cause.table === 'Membership' &&
      cause.constraint?.index === MEMBERSHIP_USER_ORGANIZATION_CONSTRAINT
    );
  }

  if (meta.modelName !== 'Membership') {
    return false;
  }

  const target = Array.isArray(meta.target) ? meta.target.map(String) : [];
  return target.includes('userId') && target.includes('organizationId');
}
