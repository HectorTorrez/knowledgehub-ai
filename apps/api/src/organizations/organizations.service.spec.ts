import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationsService } from './organizations.service.js';

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

interface HarnessOptions {
  membershipCreateFails?: boolean;
  memberships?: MembershipWithOrganization[];
  memberRows?: MemberRow[];
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

  const tx = {
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
        if (options.membershipCreateFails) {
          throw new Error('membership persistence failed');
        }
        const membership = { id: `membership-${memberships.length + 1}`, ...data };
        memberships.push(membership);
        return membership;
      }),
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

  return { service, prisma, tx, organizations, memberships };
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
