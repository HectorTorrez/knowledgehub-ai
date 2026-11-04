import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SecurityAuditService } from '../audit/security-audit.service.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EmailVerificationService } from './email-verification.service.js';

const user = { id: 'user-1', email: 'ada@example.com', firstName: 'Ada' };

interface TokenRow {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

function buildService(
  options: {
    emailFails?: boolean;
    storedToken?: TokenRow | null;
    verifiedAt?: Date | null;
  } = {},
) {
  const tx = {
    user: { updateMany: vi.fn(async () => ({ count: 1 })) },
    emailVerificationToken: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  };
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        ...user,
        emailVerifiedAt: options.verifiedAt ?? null,
      })),
    },
    emailVerificationToken: {
      deleteMany: vi.fn((args: unknown) => ({ op: 'deleteMany', args })),
      create: vi.fn((args: unknown) => ({ op: 'create', args })),
      findUnique: vi.fn(async () => options.storedToken ?? null),
    },
    $transaction: vi.fn(async (input: unknown) =>
      typeof input === 'function'
        ? (input as (client: typeof tx) => Promise<unknown>)(tx)
        : input,
    ),
  };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'EMAIL_VERIFICATION_TTL_HOURS') return 48;
      if (key === 'APP_URL') return 'https://app.example.com';
      throw new Error(`unexpected config key ${key}`);
    }),
  };
  const audit = { record: vi.fn() };
  const email = {
    send: vi.fn(async (_message: EmailMessage) => {
      if (options.emailFails) throw new Error('provider down');
    }),
  };

  const service = new EmailVerificationService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    audit as unknown as SecurityAuditService,
    email as EmailSender,
  );

  return { service, prisma, tx, audit, email };
}

function tokenFromMessage(message: EmailMessage | undefined): string {
  const match = /verify-email\?token=([\w-]+)/.exec(message?.text ?? '');
  if (!match?.[1]) throw new Error('no verification link in the email');
  return match[1];
}

describe('EmailVerificationService.sendWelcome', () => {
  it('stores only the hash of the token it emails', async () => {
    const { service, prisma, email } = buildService();

    await service.sendWelcome(user, 'en');

    const message = email.send.mock.calls[0]?.[0];
    expect(message?.to).toBe('ada@example.com');
    expect(message?.subject).toContain('Welcome');
    const token = tokenFromMessage(message);
    const created = prisma.emailVerificationToken.create.mock.calls[0]?.[0] as {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    };
    expect(created.data.userId).toBe('user-1');
    expect(created.data.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 47 * 3_600_000,
    );
  });

  it('replaces earlier tokens for the user', async () => {
    const { service, prisma } = buildService();

    await service.sendWelcome(user, 'en');

    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('does not throw when the email provider fails', async () => {
    const { service } = buildService({ emailFails: true });

    await expect(service.sendWelcome(user, 'en')).resolves.toBeUndefined();
  });
});

describe('EmailVerificationService.resend', () => {
  it('sends a verification email to an unverified user', async () => {
    const { service, email } = buildService();

    await service.resend('user-1', 'es');

    expect(email.send.mock.calls[0]?.[0]?.subject).toContain('Confirma');
  });

  it('sends nothing to a user who is already verified', async () => {
    const { service, email } = buildService({ verifiedAt: new Date() });

    await service.resend('user-1', 'en');

    expect(email.send).not.toHaveBeenCalled();
  });

  it('reports a provider failure to the caller', async () => {
    const { service } = buildService({ emailFails: true });

    await expect(service.resend('user-1', 'en')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('EmailVerificationService.verify', () => {
  it('marks the user verified and consumes every token', async () => {
    const { service, prisma, tx, audit } = buildService({
      storedToken: {
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await service.verify('the-token');

    expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('the-token').digest('hex'),
      },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(tx.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(audit.record).toHaveBeenCalledWith('auth.email.verified', {
      userId: 'user-1',
    });
  });

  it('rejects an unknown token', async () => {
    const { service } = buildService({ storedToken: null });

    await expect(service.verify('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an expired token', async () => {
    const { service, tx } = buildService({
      storedToken: {
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1),
      },
    });

    await expect(service.verify('old')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
