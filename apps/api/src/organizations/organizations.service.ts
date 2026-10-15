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

/**
 * PostgreSQL unique index Prisma creates for Membership's
 * `@@unique([userId, organizationId])`. The driver adapter reports the exact
 * index name for a unique violation, so it is the reliable way to tell this
 * constraint apart from any other unique constraint on the same table.
 */
const MEMBERSHIP_USER_ORGANIZATION_CONSTRAINT =
  'Membership_userId_organizationId_key';

/**
 * Interactive-transaction options for membership mutations.
 *
 * READ COMMITTED is PostgreSQL's default and is what the organization-row lock
 * protocol relies on: a `FOR UPDATE` that blocks behind another transaction
 * re-reads the committed row (and, for later statements, the committed
 * memberships) once the lock is released. It is stated explicitly so the
 * dependency is documented rather than incidental.
 */
const MEMBERSHIP_MUTATION_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

/**
 * Serializes membership mutations for a single organization by taking an
 * exclusive row lock on its `Organization` row. It must be the first database
 * statement in the mutation transaction.
 *
 * Raw SQL is required because Prisma exposes no typed `SELECT ... FOR UPDATE`
 * API. It is issued through the interactive transaction client so Postgres
 * holds the lock until the transaction commits or rolls back. The table name is
 * quoted because Prisma maps the `Organization` model to the case-sensitive
 * `"Organization"` table (the schema declares no `@@map`), and the tagged
 * template binds the id as a parameter instead of interpolating it.
 *
 * A missing row would acquire no lock, silently defeating serialization, so its
 * absence is surfaced as a 404 instead of allowing the caller to proceed.
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

/**
 * Revalidates, inside the mutation transaction and after the organization lock
 * is held, that the actor is still an OWNER of the organization.
 *
 * The route guard only proves membership (any role) and reads outside this
 * transaction, so it cannot authorize a privileged write on its own: without
 * this re-read, a concurrent demotion could authorize the mutation from a stale
 * read. Querying by both userId and organizationId is what keeps the check
 * scoped to the tenant.
 */
export async function requireOwner(
  tx: Prisma.TransactionClient,
  context: Pick<OrganizationContext, 'userId' | 'organizationId'>,
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
    throw new ForbiddenException('Only an organization owner can add members');
  }
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
   * The transaction first acquires the organization-row lock (see
   * {@link lockOrganization}), which serializes every membership mutation for
   * the organization. Only then is the actor's OWNER role re-read and enforced
   * *inside* the same transaction. The route guard already resolved the caller's
   * membership, but that check ran before this method: a role or membership that
   * changed in between must not authorize the write, so the permission is
   * revalidated transactionally rather than trusted from the request context.
   * The role check runs before the target lookup so a non-owner cannot use the
   * error to probe which emails are registered.
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
        // The organization-row lock is acquired first so every membership
        // mutation for this organization is serialized. Only then is the
        // actor revalidated: a concurrent demotion must not race past a role
        // check that ran before it could commit.
        await lockOrganization(tx, context.organizationId);
        await requireOwner(tx, context);

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
 * The `meta` shape of a Prisma `P2002` unique-constraint violation.
 *
 * The exact shape depends on whether a driver adapter is in use. With
 * `@prisma/adapter-pg` (this project) Prisma does not populate `target` at all;
 * the driver reports the violating table as `driverAdapterError.cause.table`
 * and the unique index as `driverAdapterError.cause.constraint.index`. Without
 * an adapter, Prisma reports `{ modelName, target }` where `target` lists the
 * violating fields. Both are typed here because both are handled.
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

/**
 * True only for a unique-constraint violation on the membership join key
 * (`@@unique([userId, organizationId])`).
 *
 * Scoped narrowly: an unrelated unique violation — on `User.email`, or a future
 * unique constraint on `Membership` — must surface as an internal error rather
 * than a misleading "already a member" `409`. Matching only `modelName` is not
 * enough, because it would also swallow those other constraints on `Membership`.
 *
 * Verified against Prisma 7.10.0 with `@prisma/adapter-pg`: `meta.target` is
 * absent and the violating table and unique index name are exposed as
 * `meta.driverAdapterError.cause.table` and
 * `meta.driverAdapterError.cause.constraint.index`. The classic
 * `{ modelName, target }` shape is kept as a fallback for a non-adapter setup.
 */
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

  // Driver-adapter shape: match the exact index, not just the table, so a
  // different unique constraint on Membership is not misreported.
  const cause = meta.driverAdapterError?.cause;
  if (cause) {
    return (
      cause.table === 'Membership' &&
      cause.constraint?.index === MEMBERSHIP_USER_ORGANIZATION_CONSTRAINT
    );
  }

  // Classic Prisma shape: the model plus the list of violating fields.
  if (meta.modelName !== 'Membership') {
    return false;
  }

  const target = Array.isArray(meta.target) ? meta.target.map(String) : [];
  return target.includes('userId') && target.includes('organizationId');
}
