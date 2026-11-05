import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SecurityAuditService } from '../audit/security-audit.service.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetService } from './password-reset.service.js';
import type { PasswordService } from './password.service.js';

const user = { id: 'user-1', email: 'ada@example.com', firstName: 'Ada' };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildService(
  options: {
    userExists?: boolean;
    emailFails?: boolean;
    storedToken?: { userId: string } | null;
    consumedCount?: number;
  } = {},
) {
  const tx = {
    passwordResetToken: {
      deleteMany: vi
        .fn()
        .mockResolvedValueOnce({ count: options.consumedCount ?? 1 })
        .mockResolvedValue({ count: 0 }),
    },
    user: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    authSession: { updateMany: vi.fn(async () => ({ count: 2 })) },
  };
  const prisma = {
    user: {
      findUnique: vi.fn(async () =>
        options.userExists === false ? null : user,
      ),
    },
    passwordResetToken: {
      deleteMany: vi.fn((args: unknown) => ({ op: 'deleteMany', args })),
      create: vi.fn((args: unknown) => ({ op: 'create', args })),
      findUnique: vi.fn(async () =>
        options.storedToken === undefined
          ? { userId: 'user-1' }
          : options.storedToken,
      ),
    },
    $transaction: vi.fn(async (input: unknown) =>
      typeof input === 'function'
        ? (input as (client: typeof tx) => Promise<unknown>)(tx)
        : input,
    ),
  };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'PASSWORD_RESET_TTL_MINUTES') return 60;
      if (key === 'APP_URL') return 'https://app.example.com';
      throw new Error(`unexpected config key ${key}`);
    }),
  };
  const passwords = { hash: vi.fn(async () => 'new-hash') };
  const audit = { record: vi.fn() };
  const email = {
    send: vi.fn(async (_message: EmailMessage) => {
      if (options.emailFails) throw new Error('provider down');
    }),
  };

  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    passwords as unknown as PasswordService,
    audit as unknown as SecurityAuditService,
    email as EmailSender,
  );

  return { service, prisma, tx, passwords, audit, email };
}

describe('PasswordResetService.request', () => {
  it('emails a reset link and stores only the hash of its token', async () => {
    const { service, prisma, email } = buildService();

    await service.request('  Ada@Example.com ', 'en');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ada@example.com' } }),
    );
    const message = email.send.mock.calls[0]?.[0];
    expect(message?.subject).toContain('Reset your');
    const token = /reset-password\?token=([\w-]+)/.exec(
      message?.text ?? '',
    )?.[1];
    expect(token).toBeDefined();
    const created = prisma.passwordResetToken.create.mock.calls[0]?.[0] as {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    };
    expect(created.data.tokenHash).toBe(sha256(token ?? ''));
    expect(created.data.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 60 * 60_000,
    );
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('does nothing for an unknown email', async () => {
    const { service, prisma, email } = buildService({ userExists: false });

    await service.request('nobody@example.com', 'en');

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('hides a provider failure from the caller', async () => {
    const { service } = buildService({ emailFails: true });

    await expect(
      service.request('ada@example.com', 'en'),
    ).resolves.toBeUndefined();
  });
});

describe('PasswordResetService.reset', () => {
  it('sets the new password, verifies the email and signs out every session', async () => {
    const { service, prisma, tx, passwords, audit } = buildService();

    await service.reset('the-token', 'a brand new passphrase');

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('the-token') } }),
    );
    expect(passwords.hash).toHaveBeenCalledWith('a brand new passphrase');
    expect(tx.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        tokenHash: sha256('the-token'),
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash' },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith('auth.password.reset', {
      userId: 'user-1',
    });
  });

  it('rejects an unknown token', async () => {
    const { service, passwords } = buildService({ storedToken: null });

    await expect(
      service.reset('nope', 'whatever passphrase'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(passwords.hash).not.toHaveBeenCalled();
  });

  it('rejects an expired or already used token without changing the password', async () => {
    const { service, tx } = buildService({ consumedCount: 0 });

    await expect(
      service.reset('old', 'whatever passphrase'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });
});
