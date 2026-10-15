import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import {
  OrganizationsService,
  isDuplicateMembershipViolation,
} from './organizations.service.js';

interface MembershipWithOrganization {
  id: string;
  userId: string;
  organizationId: string;
  role: 'OWNER' | 'MEMBER';
  createdAt: Date;
  updatedAt: Date;
  organization: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

function organizationRecord(id: string, name: string) {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function membershipRow(
  organization: MembershipWithOrganization['organization'],
  role: 'OWNER' | 'MEMBER',
): MembershipWithOrganization {
  return {
    id: `membership-${organization.id}`,
    userId: 'user-1',
    organizationId: organization.id,
    role,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    organization,
  };
}

interface MemberRow {
  role: 'OWNER' | 'MEMBER';
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

function memberRow(
  userId: string,
  role: 'OWNER' | 'MEMBER',
  createdAt = new Date('2026-01-01T00:00:00.000Z'),
): MemberRow {
  return {
    role,
    createdAt,
    user: {
      id: userId,
      email: `${userId}@example.test`,
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  };
}

interface TargetUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

const defaultTargetUser: TargetUser = {
  id: 'new-user',
  email: 'new-user@example.test',
  firstName: 'Grace',
  lastName: 'Hopper',
};

interface HarnessOptions {
  membershipCreateFails?: boolean;
  membershipCreateError?: unknown;
  memberships?: MembershipWithOrganization[];
  memberRows?: MemberRow[];
  actorMembership?: { role: 'OWNER' | 'MEMBER' } | null;
  targetUser?: TargetUser | null;
  lockRows?: { id: string }[];
}

/** Builds the real adapter P2002 meta for the membership join constraint. */
function membershipUniqueError(): unknown {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'Membership',
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          table: 'Membership',
          constraint: { index: 'Membership_userId_organizationId_key' },
        },
      },
    },
  });
}

/** Builds a P2002 for a different unique constraint on the Membership table. */
function otherMembershipUniqueError(): unknown {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'Membership',
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          table: 'Membership',
          constraint: { index: 'Membership_inviteToken_key' },
        },
      },
    },
  });
}

/** Builds the real adapter P2002 meta for the User email constraint. */
function userUniqueError(): unknown {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'User',
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          table: 'User',
          constraint: { index: 'User_email_key' },
        },
      },
    },
  });
}

/**
 * Builds the service with hand-rolled doubles. The `$transaction` double runs
 * the callback against a stateful transaction client and rolls the store back
 * when the callback throws, so the atomicity requirement is exercised rather
 * than stubbed away.
 */
function createHarness(options: HarnessOptions = {}) {
  const organizations: ReturnType<typeof organizationRecord>[] = [];
  const memberships: Record<string, unknown>[] = [];
  const calls: string[] = [];

  const tx = {
    $queryRaw: vi.fn(async () => {
      calls.push('lock-organization');
      return options.lockRows ?? [{ id: 'org-1' }];
    }),
    organization: {
      create: vi.fn(async ({ data }: { data: { name: string } }) => {
        const organization = organizationRecord(
          `org-${organizations.length + 1}`,
          data.name,
        );
        organizations.push(organization);
        return organization;
      }),
    },
    membership: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.membershipCreateError !== undefined) {
          throw options.membershipCreateError;
        }
        if (options.membershipCreateFails) {
          throw new Error('membership persistence failed');
        }
        const membership = {
          id: `membership-${memberships.length + 1}`,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
          ...data,
        };
        memberships.push(membership);
        return membership;
      }),
      findUnique: vi.fn(async () => {
        calls.push('read-actor-membership');
        return options.actorMembership === undefined
          ? { role: 'OWNER' }
          : options.actorMembership;
      }),
    },
    user: {
      findUnique: vi.fn(
        async () =>
          options.targetUser === undefined
            ? defaultTargetUser
            : options.targetUser,
      ),
    },
  };

  const prisma = {
    membership: {
      findMany: vi.fn(
        async () => options.memberRows ?? options.memberships ?? [],
      ),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        const organizationSnapshot = [...organizations];
        const membershipSnapshot = [...memberships];
        try {
          return await callback(tx);
        } catch (error) {
          organizations.length = 0;
          organizations.push(...organizationSnapshot);
          memberships.length = 0;
          memberships.push(...membershipSnapshot);
          throw error;
        }
      },
    ),
  };

  const service = new OrganizationsService(prisma as unknown as PrismaService);

  return { service, prisma, tx, organizations, memberships, calls };
}

describe('OrganizationsService.create', () => {
  it('returns the created organization with the caller OWNER role and ISO timestamps', async () => {
    const { service } = createHarness();

    const result = await service.create('user-1', { name: 'Acme Inc.' });

    expect(result).toEqual({
      organization: {
        id: 'org-1',
        name: 'Acme Inc.',
        role: 'OWNER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('creates the organization and the owner membership in a single transaction', async () => {
    const { service, prisma, tx } = createHarness();

    await service.create('user-1', { name: 'Acme Inc.' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.membership.create).toHaveBeenCalledTimes(1);
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      },
    });
  });

  it('uses the authenticated user id as the owner, never a request-supplied id', async () => {
    const { service, tx } = createHarness();

    await service.create('session-user-id', { name: 'Acme Inc.' });

    const data = tx.membership.create.mock.calls[0][0].data as {
      userId: string;
    };
    expect(data.userId).toBe('session-user-id');
  });

  it('persists the parsed name exactly', async () => {
    const { service, tx } = createHarness();

    await service.create('user-1', { name: 'Acme Inc.' });

    expect(
      (tx.organization.create.mock.calls[0][0].data as { name: string }).name,
    ).toBe('Acme Inc.');
  });

  it('rolls back and leaves no organization when membership creation fails', async () => {
    const { service, organizations, memberships } = createHarness({
      membershipCreateFails: true,
    });

    await expect(
      service.create('user-1', { name: 'Acme Inc.' }),
    ).rejects.toThrow('membership persistence failed');

    expect(organizations).toHaveLength(0);
    expect(memberships).toHaveLength(0);
  });
});

describe('OrganizationsService.listForUser', () => {
  it('scopes the query to the authenticated user membership rows', async () => {
    const { service, prisma } = createHarness();

    await service.listForUser('user-1');

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { organization: true },
      orderBy: [
        { organization: { createdAt: 'asc' } },
        { organizationId: 'asc' },
      ],
    });
  });

  it('returns the caller role for each organization', async () => {
    const { service } = createHarness({
      memberships: [
        membershipRow(organizationRecord('org-1', 'Acme'), 'OWNER'),
        membershipRow(organizationRecord('org-2', 'Globex'), 'MEMBER'),
      ],
    });

    const result = await service.listForUser('user-1');

    expect(result.organizations.map((organization) => organization.role)).toEqual(
      ['OWNER', 'MEMBER'],
    );
  });

  it('returns an empty list when the user has no memberships', async () => {
    const { service } = createHarness({ memberships: [] });

    await expect(service.listForUser('user-1')).resolves.toEqual({
      organizations: [],
    });
  });

  it('preserves the deterministic database ordering', async () => {
    const { service } = createHarness({
      memberships: [
        membershipRow(organizationRecord('org-b', 'B'), 'OWNER'),
        membershipRow(organizationRecord('org-a', 'A'), 'MEMBER'),
      ],
    });

    const result = await service.listForUser('user-1');

    expect(result.organizations.map((organization) => organization.id)).toEqual(
      ['org-b', 'org-a'],
    );
  });

  it('does not expose internal database fields', async () => {
    const { service } = createHarness({
      memberships: [membershipRow(organizationRecord('org-1', 'Acme'), 'OWNER')],
    });

    const result = await service.listForUser('user-1');

    expect(result.organizations[0]).toEqual({
      id: 'org-1',
      name: 'Acme',
      role: 'OWNER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('passwordHash');
  });
});

describe('OrganizationsService.getDetail', () => {
  it('returns the authorized organization with the membership role', async () => {
    const { service } = createHarness();

    const result = await service.getDetail({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'MEMBER',
      organization: {
        id: 'org-1',
        name: 'Acme',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    expect(result).toEqual({
      organization: {
        id: 'org-1',
        name: 'Acme',
        role: 'MEMBER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('does not expose internal database fields', async () => {
    const { service } = createHarness();

    const result = await service.getDetail({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'OWNER',
      organization: {
        id: 'org-1',
        name: 'Acme',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('passwordHash');
  });
});

describe('OrganizationsService.listMembers', () => {
  it('scopes the query to the authorized organization', async () => {
    const { service, prisma } = createHarness({ memberRows: [] });

    await service.listMembers('org-1');

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
  });

  it('maps each membership to the public member shape with the membership createdAt', async () => {
    const { service } = createHarness({
      memberRows: [
        memberRow('owner-1', 'OWNER', new Date('2026-01-01T00:00:00.000Z')),
        memberRow('member-2', 'MEMBER', new Date('2026-01-02T00:00:00.000Z')),
      ],
    });

    const result = await service.listMembers('org-1');

    expect(result.members).toEqual([
      {
        userId: 'owner-1',
        email: 'owner-1@example.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'OWNER',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        userId: 'member-2',
        email: 'member-2@example.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'MEMBER',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('preserves the deterministic database ordering', async () => {
    const { service } = createHarness({
      memberRows: [
        memberRow('b-user', 'MEMBER', new Date('2026-01-01T00:00:00.000Z')),
        memberRow('a-user', 'OWNER', new Date('2026-01-02T00:00:00.000Z')),
      ],
    });

    const result = await service.listMembers('org-1');

    expect(result.members.map((member) => member.userId)).toEqual([
      'b-user',
      'a-user',
    ]);
  });

  it('excludes internal user fields from the response', async () => {
    const { service } = createHarness({
      memberRows: [memberRow('user-1', 'OWNER')],
    });

    const result = await service.listMembers('org-1');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('sessionId');
    expect(serialized).not.toContain('revokedAt');
    expect(serialized).not.toContain('organizationId');
    expect(Object.keys(result.members[0])).toEqual([
      'userId',
      'email',
      'firstName',
      'lastName',
      'role',
      'createdAt',
    ]);
  });
});

function organizationContext(
  role: 'OWNER' | 'MEMBER' = 'OWNER',
): OrganizationContext {
  return {
    organizationId: 'org-1',
    userId: 'owner-1',
    role,
    organization: {
      id: 'org-1',
      name: 'Acme',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };
}

describe('OrganizationsService.addMember', () => {
  it('adds an existing user as a MEMBER and returns the public member shape', async () => {
    const { service } = createHarness();

    const result = await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(result).toEqual({
      member: {
        userId: 'new-user',
        email: 'new-user@example.test',
        firstName: 'Grace',
        lastName: 'Hopper',
        role: 'MEMBER',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    });
  });

  it('always writes role MEMBER for the organization from the context', async () => {
    const { service, tx } = createHarness();

    await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(tx.membership.create).toHaveBeenCalledWith({
      data: {
        userId: 'new-user',
        organizationId: 'org-1',
        role: 'MEMBER',
      },
      select: { role: true, createdAt: true },
    });
  });

  it('normalizes the email before the lookup, like registration', async () => {
    const { service, tx } = createHarness();

    await service.addMember(organizationContext(), {
      email: '  New-User@Example.Test  ',
    });

    expect(tx.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'new-user@example.test' },
      }),
    );
  });

  it('acquires the organization lock before reading the actor membership', async () => {
    const { service, calls } = createHarness();

    await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(calls).toEqual(['lock-organization', 'read-actor-membership']);
  });

  it('locks the organization through a parameterized FOR UPDATE query', async () => {
    const { service, tx } = createHarness();

    await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, organizationId] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('')).toContain('FROM "Organization"');
    expect(strings.join('')).toContain('FOR UPDATE');
    expect(organizationId).toBe('org-1');
  });

  it('fails with 404 without reading the actor or writing when the organization row is missing', async () => {
    const { service, tx, memberships, calls } = createHarness({ lockRows: [] });

    await expect(
      service.addMember(organizationContext(), {
        email: 'new-user@example.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(calls).toEqual(['lock-organization']);
    expect(tx.membership.create).not.toHaveBeenCalled();
    expect(memberships).toHaveLength(0);
  });

  it('revalidates the OWNER role on the transaction client', async () => {
    const { service, tx } = createHarness();

    await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(tx.membership.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.membership.findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'owner-1',
          organizationId: 'org-1',
        },
      },
      select: { role: true },
    });
  });

  it('rejects with 403 when the transaction re-read shows a non-owner, even if the context claimed OWNER', async () => {
    const { service, tx, memberships } = createHarness({
      actorMembership: { role: 'MEMBER' },
    });

    await expect(
      service.addMember(organizationContext('OWNER'), {
        email: 'new-user@example.test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.membership.create).not.toHaveBeenCalled();
    expect(memberships).toHaveLength(0);
  });

  it('rejects with 403 when the actor membership no longer exists in the transaction', async () => {
    const { service, tx } = createHarness({ actorMembership: null });

    await expect(
      service.addMember(organizationContext('OWNER'), {
        email: 'new-user@example.test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('rejects with 404 when no user exists for the email', async () => {
    const { service, tx } = createHarness({ targetUser: null });

    await expect(
      service.addMember(organizationContext(), {
        email: 'missing@example.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate membership as 409 without leaking the database error', async () => {
    const { service } = createHarness({
      membershipCreateError: membershipUniqueError(),
    });

    const error = await service
      .addMember(organizationContext(), { email: 'new-user@example.test' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'User is already a member of this organization',
    );
    expect((error as Error).message).not.toContain('P2002');
  });

  it('does not leak internal fields in the response', async () => {
    const { service } = createHarness();

    const result = await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('organizationId');
    expect(Object.keys(result.member)).toEqual([
      'userId',
      'email',
      'firstName',
      'lastName',
      'role',
      'createdAt',
    ]);
  });

  it('only treats a membership unique violation as a duplicate', () => {
    expect(isDuplicateMembershipViolation(membershipUniqueError())).toBe(true);
    expect(isDuplicateMembershipViolation(otherMembershipUniqueError())).toBe(
      false,
    );
    expect(isDuplicateMembershipViolation(userUniqueError())).toBe(false);
    expect(isDuplicateMembershipViolation(new Error('boom'))).toBe(false);
  });
});

describe('isDuplicateMembershipViolation', () => {
  it('recognizes the adapter-shaped membership join constraint', () => {
    expect(isDuplicateMembershipViolation(membershipUniqueError())).toBe(true);
  });

  it('recognizes the classic Prisma shape via modelName and target', () => {
    expect(
      isDuplicateMembershipViolation(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'Membership', target: ['userId', 'organizationId'] },
        }),
      ),
    ).toBe(true);
  });

  it('does not treat another unique constraint on Membership as a duplicate', () => {
    expect(isDuplicateMembershipViolation(otherMembershipUniqueError())).toBe(
      false,
    );
    expect(
      isDuplicateMembershipViolation(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'Membership', target: ['inviteToken'] },
        }),
      ),
    ).toBe(false);
  });

  it('does not treat a unique violation on User as a duplicate', () => {
    expect(isDuplicateMembershipViolation(userUniqueError())).toBe(false);
    expect(
      isDuplicateMembershipViolation(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'User', target: ['email'] },
        }),
      ),
    ).toBe(false);
  });

  it('only recognizes P2002 violations, not other Prisma or plain errors', () => {
    expect(
      isDuplicateMembershipViolation(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2001',
          clientVersion: 'test',
          meta: { modelName: 'Membership' },
        }),
      ),
    ).toBe(false);
    expect(isDuplicateMembershipViolation(new Error('boom'))).toBe(false);
    expect(isDuplicateMembershipViolation(undefined)).toBe(false);
  });

  it('does not guess when neither shape identifies the constraint', () => {
    expect(
      isDuplicateMembershipViolation(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'Membership' },
        }),
      ),
    ).toBe(false);
  });
});
