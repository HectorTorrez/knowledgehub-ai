import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type {
  AccountProvisioner,
  AuthResult,
  AuthService,
  InvitedAccountInput,
} from '../auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.port.js';
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
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
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

function buildService(
  options: {
    actorRole?: 'OWNER' | 'MEMBER';
    invitation?: InvitationRow | null;
    userEmail?: string | null;
    userVerified?: boolean;
    deleteCount?: number;
    ttlDays?: number;
    emailFails?: boolean;
    claimCount?: number;
    accountExists?: boolean;
  } = {},
) {
  const tx = {
    membership: { upsert: vi.fn(async () => ({})), findUnique: vi.fn() },
    organizationInvitation: {
      updateMany: vi.fn(async () => ({ count: options.claimCount ?? 1 })),
    },
  };

  const prisma = {
    membership: {
      findUnique: vi.fn(async () => ({ role: options.actorRole ?? 'OWNER' })),
    },
    user: {
      findUnique: vi.fn(async (args: { where: { email?: string } }) => {
        if (args.where.email !== undefined) {
          return options.accountExists ? { id: 'existing-user' } : null;
        }
        if (options.userEmail === null) {
          return null;
        }
        return {
          email: options.userEmail ?? 'invitee@example.com',
          emailVerifiedAt: options.userVerified === false ? null : new Date(),
        };
      }),
      findUniqueOrThrow: vi.fn(async () => ({
        firstName: 'Ada',
        lastName: 'Lovelace',
      })),
    },
    organization: {
      findUniqueOrThrow: vi.fn(async () => ({ name: 'Acme' })),
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
      findFirst: vi.fn(async () => invitationRow()),
      findUnique: vi.fn(async () => options.invitation ?? null),
      deleteMany: vi.fn(async () => ({ count: options.deleteCount ?? 1 })),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'INVITATION_TTL_DAYS') return options.ttlDays ?? 7;
      if (key === 'APP_URL') return 'https://app.example.com';
      throw new Error(`unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  const activity = { record: vi.fn(async () => {}) };
  const email = {
    send: vi.fn(async (_message: EmailMessage) => {
      if (options.emailFails) throw new Error('provider down');
    }),
  };
  const auth = {
    registerInvited: vi.fn(
      async (
        _input: InvitedAccountInput,
        provision: AccountProvisioner,
      ): Promise<AuthResult> => {
        await provision(tx as unknown as Prisma.TransactionClient, 'new-user');
        return {
          user: {
            id: 'new-user',
            email: 'invitee@example.com',
            firstName: 'Grace',
            lastName: 'Hopper',
            emailVerified: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          accessToken: 'access',
          refreshToken: 'refresh',
        };
      },
    ),
  };

  return {
    service: new InvitationsService(
      prisma,
      config,
      activity as unknown as ActivityService,
      email as EmailSender,
      auth as unknown as AuthService,
    ),
    prisma,
    tx,
    auth,
    activity,
    email,
  };
}

describe('InvitationsService', () => {
  it('creates a pending invitation with a one-time token for an owner', async () => {
    const { service, prisma, activity } = buildService();

    const result = await service.create(OWNER, '  Invitee@Example.com ');

    expect(result.invitation).toMatchObject({
      id: 'inv-1',
      email: 'invitee@example.com',
      role: 'MEMBER',
    });
    expect(result.invitation.token).toEqual(expect.any(String));

    const createArg = (
      prisma.organizationInvitation.create as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as {
      data: { email: string; tokenHash: string; role: string; expiresAt: Date };
    };
    expect(createArg.data.email).toBe('invitee@example.com');
    expect(createArg.data.tokenHash).not.toBe(result.invitation.token);
    expect(createArg.data.tokenHash).toHaveLength(64);
    expect(createArg.data.role).toBe('MEMBER');
    expect(activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'INVITATION_CREATED' }),
    );
  });

  it('emails the invitee a link carrying the one-time token', async () => {
    const { service, email } = buildService();

    const result = await service.create(
      OWNER,
      'invitee@example.com',
      'ADMIN',
      'es',
    );

    expect(result.emailDelivered).toBe(true);
    expect(email.send).toHaveBeenCalledTimes(1);
    const message = email.send.mock.calls[0]?.[0];
    expect(message?.to).toBe('invitee@example.com');
    expect(message?.subject).toContain('Ada Lovelace');
    expect(message?.subject).toContain('Acme');
    expect(message?.text).toContain(
      `https://app.example.com/invite?token=${result.invitation.token}`,
    );
  });

  it('keeps the invitation and reports it when the email cannot be sent', async () => {
    const { service, prisma } = buildService({ emailFails: true });

    const result = await service.create(OWNER, 'invitee@example.com');

    expect(result.emailDelivered).toBe(false);
    expect(result.invitation.token).toEqual(expect.any(String));
    expect(prisma.organizationInvitation.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-owner trying to create an invitation', async () => {
    const { service, activity, email } = buildService({ actorRole: 'MEMBER' });

    await expect(
      service.create(MEMBER, 'invitee@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(activity.record).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('lists pending invitations for an owner', async () => {
    const { service, prisma } = buildService();
    (
      prisma.organizationInvitation.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([invitationRow()]);

    const result = await service.list(OWNER);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]).toMatchObject({
      id: 'inv-1',
      email: 'invitee@example.com',
      role: 'MEMBER',
    });
  });

  it('revokes an invitation scoped to the organization', async () => {
    const { service, prisma, activity } = buildService();

    await service.revoke(OWNER, 'inv-1');

    expect(prisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', organizationId: 'org-1' },
    });
    expect(activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'INVITATION_REVOKED' }),
    );
  });

  it('returns 404 when revoking an invitation that does not exist', async () => {
    const { service } = buildService({ deleteCount: 0 });

    await expect(service.revoke(OWNER, 'inv-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('accepts a valid invitation and returns the organization id', async () => {
    const { service, prisma, activity } = buildService({
      invitation: invitationRow(),
    });

    const result = await service.accept('user-1', 'the-token');

    expect(result).toEqual({ organizationId: 'org-1' });
    expect(prisma.organizationInvitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: expect.any(String) } }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'INVITATION_ACCEPTED' }),
    );
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

  it('rejects an account whose email is not verified', async () => {
    const { service, activity } = buildService({
      invitation: invitationRow(),
      userVerified: false,
    });

    await expect(service.accept('user-1', 'the-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('rejects an expired or already-accepted invitation', async () => {
    const expired = buildService({
      invitation: invitationRow({ acceptedAt: new Date() }),
    });
    await expect(
      expired.service.accept('user-1', 'token'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const missing = buildService({ invitation: null });
    await expect(
      missing.service.accept('user-1', 'token'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a second accept that loses the race to claim the invitation', async () => {
    const { service, tx } = buildService({
      invitation: invitationRow(),
      claimCount: 0,
    });

    await expect(service.accept('user-1', 'token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.membership.upsert).not.toHaveBeenCalled();
  });

  it('previews a pending invitation for someone without an account', async () => {
    const { service } = buildService({ invitation: invitationRow() });

    await expect(service.preview('token')).resolves.toEqual({
      email: 'invitee@example.com',
      role: 'MEMBER',
      organizationName: 'Acme',
      accountExists: false,
    });
  });

  it('tells the invitee to sign in when the email already has an account', async () => {
    const { service } = buildService({
      invitation: invitationRow(),
      accountExists: true,
    });

    await expect(service.preview('token')).resolves.toMatchObject({
      accountExists: true,
    });
  });

  it('refuses to preview an expired invitation', async () => {
    const { service } = buildService({
      invitation: invitationRow({ expiresAt: new Date(Date.now() - 1000) }),
    });

    await expect(service.preview('token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates the account for the invited email and joins it to the organization', async () => {
    const { service, auth, tx, activity } = buildService({
      invitation: invitationRow({ role: 'ADMIN' }),
    });

    const result = await service.acceptWithNewAccount({
      token: 'token',
      firstName: 'Grace',
      lastName: 'Hopper',
      password: 'a-strong-password',
    });

    expect(result.organizationId).toBe('org-1');
    expect(auth.registerInvited).toHaveBeenCalledWith(
      {
        email: 'invitee@example.com',
        password: 'a-strong-password',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
      expect.any(Function),
      {},
    );
    expect(tx.organizationInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'inv-1', acceptedAt: null }),
      }),
    );
    expect(tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'new-user', organizationId: 'org-1', role: 'ADMIN' },
      }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'INVITATION_ACCEPTED',
        actorId: 'new-user',
      }),
    );
  });

  it('creates no account for an invalid invitation token', async () => {
    const { service, auth } = buildService({ invitation: null });

    await expect(
      service.acceptWithNewAccount({
        token: 'token',
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'a-strong-password',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auth.registerInvited).not.toHaveBeenCalled();
  });

  it('rolls back the new account when the invitation was claimed meanwhile', async () => {
    const { service } = buildService({
      invitation: invitationRow(),
      claimCount: 0,
    });

    await expect(
      service.acceptWithNewAccount({
        token: 'token',
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'a-strong-password',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
