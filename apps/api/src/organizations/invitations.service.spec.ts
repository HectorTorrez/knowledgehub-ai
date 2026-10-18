import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import { InvitationsService } from './invitations.service.js';

const OWNER: OrganizationContext = {
  organizationId: 'org-1',
  userId: 'owner-1',
  role: 'OWNER',
  organization: {
    id: 'org-1',
    name: 'Acme',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const MEMBER: OrganizationContext = {
  ...OWNER,
  userId: 'member-1',
  role: 'MEMBER',
};

interface InvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

function invitationRow(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'invitee@example.com',
    role: 'MEMBER',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildService(options: {
  actorRole?: 'OWNER' | 'MEMBER';
  invitation?: InvitationRow | null;
  userEmail?: string | null;
  deleteCount?: number;
  ttlDays?: number;
} = {}) {
  const prisma = {
    membership: {
      findUnique: vi.fn(async () => ({ role: options.actorRole ?? 'OWNER' })),
    },
    user: {
      findUnique: vi.fn(async () => {
        if (options.userEmail === null) {
          return null;
        }
        return { email: options.userEmail ?? 'invitee@example.com' };
      }),
    },
    organizationInvitation: {
      create: vi.fn(async (args?: unknown) => {
        const data = (args as { data: { email: string; expiresAt: Date } })
          .data;
        return {
          id: 'inv-1',
          email: data.email,
          role: 'MEMBER',
          expiresAt: data.expiresAt,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        };
      }),
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => options.invitation ?? null),
      deleteMany: vi.fn(async () => ({ count: options.deleteCount ?? 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        membership: { upsert: vi.fn(async () => ({})), findUnique: vi.fn() },
        organizationInvitation: { update: vi.fn(async () => ({})), findUnique: vi.fn() },
      }),
    ),
  } as unknown as PrismaService;

  const config = {
    getOrThrow: vi.fn(
      (key: string) => (key === 'INVITATION_TTL_DAYS' ? (options.ttlDays ?? 7) : 0),
    ),
  } as unknown as ConfigService;

  return { service: new InvitationsService(prisma, config), prisma };
}

describe('InvitationsService', () => {
  it('creates a pending invitation with a one-time token for an owner', async () => {
    const { service, prisma } = buildService();

    const result = await service.create(OWNER, '  Invitee@Example.com ');

    expect(result.invitation).toMatchObject({
      id: 'inv-1',
      email: 'invitee@example.com',
      role: 'MEMBER',
    });
    expect(result.invitation.token).toEqual(expect.any(String));

    const createArg = (prisma.organizationInvitation.create as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0] as {
      data: { email: string; tokenHash: string; role: string; expiresAt: Date };
    };
    expect(createArg.data.email).toBe('invitee@example.com');
    expect(createArg.data.tokenHash).not.toBe(result.invitation.token);
    expect(createArg.data.tokenHash).toHaveLength(64);
    expect(createArg.data.role).toBe('MEMBER');
  });

  it('rejects a non-owner trying to create an invitation', async () => {
    const { service } = buildService({ actorRole: 'MEMBER' });

    await expect(service.create(MEMBER, 'invitee@example.com')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lists pending invitations for an owner', async () => {
    const { service, prisma } = buildService();
    (prisma.organizationInvitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      invitationRow(),
    ]);

    const result = await service.list(OWNER);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]).toMatchObject({
      id: 'inv-1',
      email: 'invitee@example.com',
      role: 'MEMBER',
    });
  });

  it('revokes an invitation scoped to the organization', async () => {
    const { service, prisma } = buildService();

    await service.revoke(OWNER, 'inv-1');

    expect(prisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', organizationId: 'org-1' },
    });
  });

  it('returns 404 when revoking an invitation that does not exist', async () => {
    const { service } = buildService({ deleteCount: 0 });

    await expect(service.revoke(OWNER, 'inv-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('accepts a valid invitation and returns the organization id', async () => {
    const { service, prisma } = buildService({ invitation: invitationRow() });

    const result = await service.accept('user-1', 'the-token');

    expect(result).toEqual({ organizationId: 'org-1' });
    expect(prisma.organizationInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
  });

  it('rejects an invitation for a different account', async () => {
    const { service } = buildService({
      invitation: invitationRow(),
      userEmail: 'someone-else@example.com',
    });

    await expect(service.accept('user-1', 'the-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an expired or already-accepted invitation', async () => {
    const expired = buildService({
      invitation: invitationRow({ acceptedAt: new Date() }),
    });
    await expect(expired.service.accept('user-1', 'token')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const missing = buildService({ invitation: null });
    await expect(missing.service.accept('user-1', 'token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
