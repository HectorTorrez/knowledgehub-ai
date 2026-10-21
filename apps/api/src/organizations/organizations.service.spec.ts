import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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

const ACTOR_USER_ID = 'owner-1';

interface TargetMembershipRow {
  role: 'OWNER' | 'MEMBER';
  createdAt: Date;
  user: TargetUser;
}

function targetMembershipRow(
  userId: string,
  role: 'OWNER' | 'MEMBER',
  createdAt = new Date('2026-01-01T00:00:00.000Z'),
): TargetMembershipRow {
  return {
    role,
    createdAt,
    user: {
      id: userId,
      email: `${userId}@example.test`,
      firstName: 'Grace',
      lastName: 'Hopper',
    },
  };
}

interface HarnessOptions {
  transactionError?: unknown;
  membershipCreateFails?: boolean;
  membershipCreateError?: unknown;
  memberships?: MembershipWithOrganization[];
  memberRows?: MemberRow[];
  actorMembership?: { role: 'OWNER' | 'MEMBER' } | null;
  targetUser?: TargetUser | null;
  targetMembership?: TargetMembershipRow | null;
  ownerCount?: number;
  lockRows?: { id: string }[];
}

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

function createHarness(options: HarnessOptions = {}) {
  const organizations: ReturnType<typeof organizationRecord>[] = [];
  const memberships: Record<string, unknown>[] = [];
  const calls: string[] = [];

  const tx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('');
        if (sql.includes('set_config')) {
          calls.push('bound-lock-wait');
          return [{ set_config: values[0] }];
        }
        calls.push('lock-organization');
        return options.lockRows ?? [{ id: 'org-1' }];
      },
    ),
    organization: {
      create: vi.fn(async ({ data }: { data: { name: string } }) => {
        const organization = organizationRecord(
          `org-${organizations.length + 1}`,
          data.name,
        );
        organizations.push(organization);
        return organization;
      }),
      update: vi.fn(async ({ data }: { data: { name: string } }) =>
        organizationRecord('org-1', data.name),
      ),
      delete: vi.fn(async () => organizationRecord('org-1', 'Acme')),
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
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { userId_organizationId: { userId: string } };
        }) => {
          const { userId } = where.userId_organizationId;
          if (userId === ACTOR_USER_ID) {
            calls.push('read-actor-membership');
            return options.actorMembership === undefined
              ? { role: 'OWNER' }
              : options.actorMembership;
          }
          calls.push('read-target-membership');
          return options.targetMembership ?? null;
        },
      ),
      count: vi.fn(async () => {
        calls.push('count-owners');
        return options.ownerCount ?? 1;
      }),
      update: vi.fn(
        async ({ data }: { data: { role: 'OWNER' | 'MEMBER' } }) => {
          calls.push('update-membership');
          const base =
            options.targetMembership ??
            targetMembershipRow('target-user', 'MEMBER');
          return { ...base, role: data.role };
        },
      ),
      delete: vi.fn(async () => {
        calls.push('delete-membership');
        return (
          options.targetMembership ?? targetMembershipRow('target-user', 'MEMBER')
        );
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
        if (options.transactionError !== undefined) {
          throw options.transactionError;
        }
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

    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
    ]);
  });

  it('bounds the lock wait before the parameterized FOR UPDATE query', async () => {
    const { service, tx } = createHarness();

    await service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);

    const [setConfigStrings, lockTimeout] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(setConfigStrings.join('')).toContain('set_config');
    expect(setConfigStrings.join('')).toContain('lock_timeout');
    expect(lockTimeout).toBe('1000ms');

    const [strings, organizationId] = tx.$queryRaw.mock.calls[1] as unknown as [
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

    expect(calls).toEqual(['bound-lock-wait', 'lock-organization']);
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

const TARGET_USER_ID = 'target-user';

describe('OrganizationsService.updateMemberRole', () => {
  it('promotes a MEMBER to OWNER and returns the public member shape', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    const result = await service.updateMemberRole(
      organizationContext(),
      TARGET_USER_ID,
      { role: 'OWNER' },
    );

    expect(result).toEqual({
      member: {
        userId: TARGET_USER_ID,
        email: 'target-user@example.test',
        firstName: 'Grace',
        lastName: 'Hopper',
        role: 'OWNER',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.membership.count).not.toHaveBeenCalled();
  });

  it('scopes the update to the context organization and route user, not request input', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
      role: 'OWNER',
    });

    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: TARGET_USER_ID,
            organizationId: 'org-1',
          },
        },
        data: { role: 'OWNER' },
      }),
    );
  });

  it('demotes an OWNER to MEMBER when another owner remains', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'OWNER'),
      ownerCount: 2,
    });

    const result = await service.updateMemberRole(
      organizationContext(),
      TARGET_USER_ID,
      { role: 'MEMBER' },
    );

    expect(result.member.role).toBe('MEMBER');
    expect(tx.membership.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', role: 'OWNER' },
    });
    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'MEMBER' } }),
    );
  });

  it('treats assigning the role a member already holds as a successful no-op', async () => {
    const { service, tx, calls } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    const result = await service.updateMemberRole(
      organizationContext(),
      TARGET_USER_ID,
      { role: 'MEMBER' },
    );

    expect(result.member.role).toBe('MEMBER');
    expect(tx.membership.update).not.toHaveBeenCalled();
    expect(tx.membership.count).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
      'read-target-membership',
    ]);
  });

  it('treats re-assigning OWNER to an owner as a successful no-op', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'OWNER'),
    });

    const result = await service.updateMemberRole(
      organizationContext(),
      TARGET_USER_ID,
      { role: 'OWNER' },
    );

    expect(result.member.role).toBe('OWNER');
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('acquires the organization lock before reading the actor and the target', async () => {
    const { service, calls } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
      role: 'OWNER',
    });

    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
      'read-target-membership',
      'update-membership',
    ]);
  });

  it('locks the organization through a parameterized FOR UPDATE query', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
      role: 'OWNER',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const [strings, organizationId] = tx.$queryRaw.mock.calls[1] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('')).toContain('FROM "Organization"');
    expect(strings.join('')).toContain('FOR UPDATE');
    expect(organizationId).toBe('org-1');
  });

  it('fails with 404 without reading the actor when the organization row is missing', async () => {
    const { service, tx, calls } = createHarness({
      lockRows: [],
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await expect(
      service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(calls).toEqual(['bound-lock-wait', 'lock-organization']);
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('revalidates the OWNER role on the transaction client', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
      role: 'OWNER',
    });

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

  it('rejects with 403 when the transaction re-read shows a non-owner, before touching the target', async () => {
    const { service, tx, calls } = createHarness({
      actorMembership: { role: 'MEMBER' },
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    const error = await service
      .updateMemberRole(organizationContext('OWNER'), TARGET_USER_ID, {
        role: 'OWNER',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toContain('change member roles');
    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
    ]);
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the actor membership no longer exists', async () => {
    const { service, tx } = createHarness({
      actorMembership: null,
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await expect(
      service.updateMemberRole(organizationContext('OWNER'), TARGET_USER_ID, {
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target is not a member of the organization', async () => {
    const { service, tx } = createHarness({ targetMembership: null });

    await expect(
      service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('returns 409 when demoting the last owner would leave no owner', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'OWNER'),
      ownerCount: 1,
    });

    const error = await service
      .updateMemberRole(organizationContext(), TARGET_USER_ID, {
        role: 'MEMBER',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Organization must have at least one owner',
    );
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('does not leak internal fields in the response', async () => {
    const { service } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    const result = await service.updateMemberRole(
      organizationContext(),
      TARGET_USER_ID,
      { role: 'OWNER' },
    );

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
});

describe('OrganizationsService.removeMember', () => {
  it('removes a MEMBER scoped to the context organization and route user', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await expect(
      service.removeMember(organizationContext(), TARGET_USER_ID),
    ).resolves.toBeUndefined();

    expect(tx.membership.delete).toHaveBeenCalledTimes(1);
    expect(tx.membership.delete).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: TARGET_USER_ID,
          organizationId: 'org-1',
        },
      },
    });
    expect(tx.membership.count).not.toHaveBeenCalled();
  });

  it('acquires the organization lock before reading the actor and the target', async () => {
    const { service, calls } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.removeMember(organizationContext(), TARGET_USER_ID);

    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
      'read-target-membership',
      'delete-membership',
    ]);
  });

  it('locks the organization through a parameterized FOR UPDATE query', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.removeMember(organizationContext(), TARGET_USER_ID);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const [strings, organizationId] = tx.$queryRaw.mock.calls[1] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('')).toContain('FROM "Organization"');
    expect(strings.join('')).toContain('FOR UPDATE');
    expect(organizationId).toBe('org-1');
  });

  it('fails with 404 without reading the actor or deleting when the organization row is missing', async () => {
    const { service, tx, calls } = createHarness({
      lockRows: [],
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await expect(
      service.removeMember(organizationContext(), TARGET_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(calls).toEqual(['bound-lock-wait', 'lock-organization']);
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('revalidates the OWNER role on the transaction client', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await service.removeMember(organizationContext(), TARGET_USER_ID);

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

  it('rejects with 403 when the transaction re-read shows a non-owner, before touching the target', async () => {
    const { service, tx, calls } = createHarness({
      actorMembership: { role: 'MEMBER' },
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    const error = await service
      .removeMember(organizationContext('OWNER'), TARGET_USER_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toContain('remove members');
    expect(calls).toEqual([
      'bound-lock-wait',
      'lock-organization',
      'read-actor-membership',
    ]);
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the actor membership no longer exists', async () => {
    const { service, tx } = createHarness({
      actorMembership: null,
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });

    await expect(
      service.removeMember(organizationContext('OWNER'), TARGET_USER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target is not a member of the organization', async () => {
    const { service, tx } = createHarness({ targetMembership: null });

    await expect(
      service.removeMember(organizationContext(), TARGET_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.membership.count).not.toHaveBeenCalled();
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('removes an OWNER when another owner remains', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'OWNER'),
      ownerCount: 2,
    });

    await service.removeMember(organizationContext(), TARGET_USER_ID);

    expect(tx.membership.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', role: 'OWNER' },
    });
    expect(tx.membership.delete).toHaveBeenCalledTimes(1);
  });

  it('allows an owner to remove themselves while another owner remains', async () => {
    const { service, tx } = createHarness({ ownerCount: 2 });

    await service.removeMember(organizationContext(), ACTOR_USER_ID);

    expect(tx.membership.delete).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: ACTOR_USER_ID,
          organizationId: 'org-1',
        },
      },
    });
  });

  it('returns 409 when removing the last owner would leave no owner', async () => {
    const { service, tx } = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'OWNER'),
      ownerCount: 1,
    });

    const error = await service
      .removeMember(organizationContext(), TARGET_USER_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Organization must have at least one owner',
    );
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('returns 409 when an owner removes themselves as the last owner', async () => {
    const { service, tx } = createHarness({ ownerCount: 1 });

    await expect(
      service.removeMember(organizationContext(), ACTOR_USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.membership.delete).not.toHaveBeenCalled();
  });
});

function adapterError(
  code: string,
  meta?: Record<string, unknown>,
): unknown {
  return new Prisma.PrismaClientKnownRequestError('adapter error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

const lockTimeoutError = () =>
  adapterError('P2010', {
    driverAdapterError: {
      cause: { kind: 'postgres', code: '55P03', originalCode: '55P03' },
    },
  });

const deadlockError = () =>
  adapterError('P2010', {
    driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } },
  });

const executionTimeoutError = () =>
  adapterError('P2028', { operation: 'query', timeout: 2000, timeTaken: 4800 });

const unrecognizedTransactionError = () =>
  new Prisma.PrismaClientKnownRequestError(
    'Transaction not found. Transaction ID is invalid.',
    { code: 'P2028', clientVersion: 'test', meta: {} },
  );

describe('OrganizationsService transient transaction mapping', () => {
  it('maps an interactive transaction timeout on addMember to 503', async () => {
    const { service, tx } = createHarness({
      transactionError: executionTimeoutError(),
    });

    const error = await service
      .addMember(organizationContext(), { email: 'new-user@example.test' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('maps a PostgreSQL lock timeout on updateMemberRole to 503', async () => {
    const { service } = createHarness({ transactionError: lockTimeoutError() });

    const error = await service
      .updateMemberRole(organizationContext(), TARGET_USER_ID, { role: 'OWNER' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a deadlock on removeMember to 503', async () => {
    const { service } = createHarness({ transactionError: deadlockError() });

    const error = await service
      .removeMember(organizationContext(), TARGET_USER_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not rewrite an unrecognized P2028 into 503', async () => {
    const original = unrecognizedTransactionError();
    const { service } = createHarness({ transactionError: original });

    const error = await service
      .updateMemberRole(organizationContext(), TARGET_USER_ID, { role: 'OWNER' })
      .catch((caught: unknown) => caught);

    expect(error).toBe(original);
    expect(error).not.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not rewrite unrelated exceptions', async () => {
    const original = new Error('boom');
    const { service } = createHarness({ transactionError: original });

    const error = await service
      .removeMember(organizationContext(), TARGET_USER_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBe(original);
  });

  it('still reports a duplicate membership as 409 when the transaction rejects with it', async () => {
    const { service } = createHarness({
      transactionError: membershipUniqueError(),
    });

    const error = await service
      .addMember(organizationContext(), { email: 'new-user@example.test' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).not.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('OrganizationsService lock wait bounding', () => {
  type Transaction = ReturnType<typeof createHarness>['tx'];

  function expectLockWaitBounded(tx: Transaction): void {
    const [strings, lockTimeout] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    const statement = strings.join('');
    expect(statement).toContain('set_config');
    expect(statement).toContain('lock_timeout');
    expect(statement).toContain('true');
    expect(lockTimeout).toBe('1000ms');
  }

  it('bounds the lock wait before locking for every membership mutation', async () => {
    const add = createHarness();
    await add.service.addMember(organizationContext(), {
      email: 'new-user@example.test',
    });
    expectLockWaitBounded(add.tx);

    const update = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });
    await update.service.updateMemberRole(organizationContext(), TARGET_USER_ID, {
      role: 'OWNER',
    });
    expectLockWaitBounded(update.tx);

    const remove = createHarness({
      targetMembership: targetMembershipRow(TARGET_USER_ID, 'MEMBER'),
    });
    await remove.service.removeMember(organizationContext(), TARGET_USER_ID);
    expectLockWaitBounded(remove.tx);
  });
});

describe('OrganizationsService.updateName', () => {
  it('renames the organization for an owner', async () => {
    const { service, tx } = createHarness();

    const result = await service.updateName(organizationContext(), {
      name: 'Renamed',
    });

    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { name: 'Renamed' },
    });
    expect(result.organization).toMatchObject({
      id: 'org-1',
      name: 'Renamed',
      role: 'OWNER',
    });
  });

  it('rejects a rename from a member', async () => {
    const { service, tx } = createHarness({ actorMembership: { role: 'MEMBER' } });

    await expect(
      service.updateName(organizationContext('MEMBER'), { name: 'Nope' }),
    ).rejects.toThrow('Only an organization owner can rename the organization');
    expect(tx.organization.update).not.toHaveBeenCalled();
  });
});

describe('OrganizationsService.deleteOrganization', () => {
  it('deletes the organization for an owner', async () => {
    const { service, tx } = createHarness();

    await service.deleteOrganization(organizationContext());

    expect(tx.organization.delete).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
  });
});

describe('OrganizationsService.leave', () => {
  it('removes the caller membership', async () => {
    const { service, tx } = createHarness({ actorMembership: { role: 'MEMBER' } });

    await service.leave(organizationContext('MEMBER'));

    expect(tx.membership.delete).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'owner-1',
          organizationId: 'org-1',
        },
      },
    });
  });

  it('blocks the last owner from leaving', async () => {
    const { service, tx } = createHarness({ ownerCount: 1 });

    await expect(service.leave(organizationContext())).rejects.toThrow(
      'You are the last owner',
    );
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it('lets an owner leave when another owner remains', async () => {
    const { service, tx } = createHarness({ ownerCount: 2 });

    await service.leave(organizationContext());

    expect(tx.membership.delete).toHaveBeenCalledTimes(1);
  });
});
