import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SecurityAuditService } from '../audit/security-audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const SESSION_TTL_MS = 7 * 86_400_000;
const REFRESH_TTL_MS = 7 * 86_400_000;
const ACCESS_TTL_MS = 900_000;

const storedUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'stored-password-hash',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

interface HarnessOptions {
  userExists?: boolean;
  passwordMatches?: boolean;
  refreshCreateFails?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
  let sessionCounter = 0;

  const tx = {
    authSession: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `session-${++sessionCounter}`,
        ...data,
      })),
      updateMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    user: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...storedUser,
        ...data,
      })),
    },
    refreshToken: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.refreshCreateFails) {
          throw new Error('refresh token persistence failed');
        }
        return { id: `token-${data.sessionId}`, ...data };
      }),
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { email?: string; id?: string } }) =>
          options.userExists !== false &&
          (where.email === storedUser.email || where.id === storedUser.id)
            ? storedUser
            : null,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...storedUser,
        ...data,
      })),
    },
    authSession: {
      findMany: vi.fn(async (_args?: unknown) => [] as unknown[]),
      updateMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const passwords = {
    hash: vi.fn(async () => 'dummy-password-hash'),
    verify: vi.fn(async () => options.passwordMatches !== false),
  };

  const tokens = {
    generateRefreshToken: vi.fn(() => ({
      token: 'refresh-token-value',
      hash: 'refresh-token-hash',
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })),
    signAccessToken: vi.fn(async (_userId: string, _sessionId: string) => {
      return 'access-token-value';
    }),
  };

  const authConfig = {
    sessionTtlMs: SESSION_TTL_MS,
    refreshTtlMs: REFRESH_TTL_MS,
    accessTtlMs: ACCESS_TTL_MS,
  } as unknown as AuthConfig;

  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    authConfig,
    { record: vi.fn() } as unknown as SecurityAuditService,
  );

  return { service, prisma, passwords, tokens, tx };
}

describe('AuthService.login', () => {
  it('authenticates a valid credential and returns only the public user', async () => {
    const { service, tokens } = createHarness();

    const result = await service.login({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(tokens.signAccessToken).toHaveBeenCalledWith('user-1', 'session-1');
  });

  it('creates a session and initial refresh token in one transaction', async () => {
    const { service, prisma, tx } = createHarness();

    const result = await service.login({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.authSession.create).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);

    const session = tx.authSession.create.mock.calls[0][0].data;
    expect(session.userId).toBe('user-1');
    expect((session.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect((session.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      Date.now() + SESSION_TTL_MS,
    );

    const token = tx.refreshToken.create.mock.calls[0][0].data;
    expect(token.sessionId).toBe('session-1');
    expect(token.tokenHash).toBe('refresh-token-hash');
    expect(token.tokenHash).not.toBe(result.refreshToken);
  });

  it('normalizes the email before lookup (case and whitespace)', async () => {
    const { service, prisma } = createHarness();

    await service.login({
      email: '  User@Example.COM  ',
      password: 'correct horse battery staple',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });

  it('creates a distinct session for each successful login', async () => {
    const { service, tokens, tx } = createHarness();

    await service.login({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });
    await service.login({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });

    expect(tx.authSession.create).toHaveBeenCalledTimes(2);
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(2);
    expect(tokens.signAccessToken).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'session-1',
    );
    expect(tokens.signAccessToken).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'session-2',
    );
  });

  it('performs a dummy password verification for an unknown email', async () => {
    const { service, passwords, prisma, tx } = createHarness({
      userExists: false,
    });

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(passwords.hash).toHaveBeenCalledTimes(1);
    expect(passwords.verify).toHaveBeenCalledTimes(1);
    expect(passwords.verify).toHaveBeenCalledWith(
      'dummy-password-hash',
      'whatever',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });

  it('returns the same generic 401 for an unknown email and an incorrect password', async () => {
    const { service } = createHarness({ passwordMatches: false });

    const unknownEmail = await service
      .login({ email: 'nobody@example.com', password: 'whatever' })
      .catch((error: unknown) => error);
    const wrongPassword = await service
      .login({ email: 'user@example.com', password: 'wrong' })
      .catch((error: unknown) => error);

    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect((unknownEmail as UnauthorizedException).getStatus()).toBe(401);
    expect((wrongPassword as UnauthorizedException).getStatus()).toBe(401);
    expect((unknownEmail as UnauthorizedException).getResponse()).toEqual(
      (wrongPassword as UnauthorizedException).getResponse(),
    );
    expect((unknownEmail as UnauthorizedException).message).toBe(
      (wrongPassword as UnauthorizedException).message,
    );
  });

  it('does not create a session or refresh token when the password is wrong', async () => {
    const { service, prisma, tx } = createHarness({ passwordMatches: false });

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.authSession.create).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not issue an access token when persistence fails', async () => {
    const { service, tokens, tx } = createHarness({ refreshCreateFails: true });

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow('refresh token persistence failed');

    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it('forwards session device context to the created session', async () => {
    const { service, tx } = createHarness();

    await service.login(
      { email: 'user@example.com', password: 'correct horse battery staple' },
      { userAgent: 'kh-agent', ipAddress: '203.0.113.7' },
    );

    expect(tx.authSession.create.mock.calls[0][0].data).toMatchObject({
      userAgent: 'kh-agent',
      ipAddress: '203.0.113.7',
    });
  });

  it('never returns a raw token or password hash in the public user', async () => {
    const { service } = createHarness();

    const result = await service.login({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });

    const serialized = JSON.stringify(result.user);
    expect(serialized).not.toContain('stored-password-hash');
    expect(serialized).not.toContain(result.accessToken);
    expect(serialized).not.toContain(result.refreshToken);
  });
});

const PRESENTED_REFRESH = 'presented-refresh-token';
const SESSION_TTL = 7 * 86_400_000;

interface RefreshTokenRow {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

interface SessionRow {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

interface RotationOverrides {
  browserAuthEnabled?: boolean;
  token?: RefreshTokenRow | null;
  session?: SessionRow | null;
  consumeCount?: number;
  activeCount?: number;
}

function createRotationHarness(overrides: RotationOverrides = {}) {
  const now = Date.now();
  const token: RefreshTokenRow | null =
    overrides.token === undefined
      ? {
          id: 'token-1',
          sessionId: 'session-1',
          tokenHash: `hash:${PRESENTED_REFRESH}`,
          expiresAt: new Date(now + 3_600_000),
          usedAt: null,
        }
      : overrides.token;
  const session: SessionRow | null =
    overrides.session === undefined
      ? {
          id: 'session-1',
          userId: 'user-1',
          revokedAt: null,
          expiresAt: new Date(now + SESSION_TTL),
        }
      : overrides.session;

  const tx = {
    refreshToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        token && token.tokenHash === where.tokenHash ? { ...token } : null,
      ),
      updateMany: vi.fn(async () => ({ count: overrides.consumeCount ?? 1 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'successor-1',
        ...data,
      })),
    },
    authSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        session && session.id === where.id ? { ...session } : null,
      ),
      updateMany: vi.fn(async () => ({ count: overrides.activeCount ?? 1 })),
    },
    user: {
      findUnique: vi.fn(async () => storedUser),
    },
  };

  const prisma = {
    refreshToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        token && token.tokenHash === where.tokenHash ? { ...token } : null,
      ),
    },
    authSession: {
      findMany: vi.fn(async (_args?: unknown) => [] as unknown[]),
      updateMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const tokens = {
    hashRefreshToken: vi.fn((value: string) => `hash:${value}`),
    generateRefreshToken: vi.fn((notAfter?: Date) => {
      const defaultExpiry = Date.now() + SESSION_TTL;
      return {
        token: 'successor-refresh-token',
        hash: 'successor-refresh-hash',
        expiresAt: new Date(
          notAfter === undefined
            ? defaultExpiry
            : Math.min(defaultExpiry, notAfter.getTime()),
        ),
      };
    }),
    signAccessToken: vi.fn(async () => 'new-access-token'),
  };

  const authConfig = {
    browserAuthEnabled: overrides.browserAuthEnabled ?? true,
    sessionTtlMs: SESSION_TTL,
    refreshTtlMs: SESSION_TTL,
    accessTtlMs: ACCESS_TTL_MS,
  } as unknown as AuthConfig;

  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as PasswordService,
    tokens as unknown as TokenService,
    authConfig,
    { record: vi.fn() } as unknown as SecurityAuditService,
  );

  return { service, prisma, tokens, tx };
}

describe('AuthService.refresh', () => {
  it('consumes the presented token, issues a successor and signs a new access token', async () => {
    const { service, prisma, tokens, tx } = createRotationHarness();

    const result = await service.refresh(PRESENTED_REFRESH);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'token-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(tokens.signAccessToken).toHaveBeenCalledWith('user-1', 'session-1');
    expect(result).toMatchObject({
      user: { id: 'user-1' },
      accessToken: 'new-access-token',
      refreshToken: 'successor-refresh-token',
    });
  });

  it('never returns the presented token or exposes it in the body user', async () => {
    const { service } = createRotationHarness();

    const result = await service.refresh(PRESENTED_REFRESH);

    expect(result.refreshToken).not.toBe(PRESENTED_REFRESH);
    expect(JSON.stringify(result.user)).not.toContain(PRESENTED_REFRESH);
  });

  it('rejects an unknown token without creating a successor', async () => {
    const { service, tokens, tx } = createRotationHarness({ token: null });

    await expect(service.refresh('unknown')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an expired token without revoking the session', async () => {
    const { service, tx } = createRotationHarness({
      token: {
        id: 'token-1',
        sessionId: 'session-1',
        tokenHash: `hash:${PRESENTED_REFRESH}`,
        expiresAt: new Date(Date.now() - 1_000),
        usedAt: null,
      },
    });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('revokes the session and rejects when the token was already used (replay)', async () => {
    const { service, tx } = createRotationHarness({
      token: {
        id: 'token-1',
        sessionId: 'session-1',
        tokenHash: `hash:${PRESENTED_REFRESH}`,
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: new Date(),
      },
    });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('treats a lost consume race as a replay and revokes the session', async () => {
    const { service, tx } = createRotationHarness({ consumeCount: 0 });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not issue a successor for a revoked or expired session', async () => {
    const { service, tx } = createRotationHarness({ activeCount: 0 });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('clamps the successor expiry to the session expiry', async () => {
    const sessionExpiresAt = new Date(Date.now() + 60_000);
    const { service, tokens } = createRotationHarness({
      session: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: sessionExpiresAt,
      },
    });

    const result = await service.refresh(PRESENTED_REFRESH);

    expect(tokens.generateRefreshToken).toHaveBeenCalledWith(sessionExpiresAt);
    expect(result.refreshTokenMaxAgeMs).toBeLessThanOrEqual(60_000);
    expect(result.refreshTokenMaxAgeMs).toBeGreaterThan(0);
  });

  it('does not sign an access token when the exchange is rejected', async () => {
    const { service, tokens } = createRotationHarness({ consumeCount: 0 });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it('rejects cookie refresh when browser authentication is disabled', async () => {
    const { service, prisma } = createRotationHarness({
      browserAuthEnabled: false,
    });

    await expect(service.refresh(PRESENTED_REFRESH)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout', () => {
  it('revokes the session identified by the refresh token', async () => {
    const { service, prisma } = createRotationHarness();

    await service.logout(PRESENTED_REFRESH);

    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('is idempotent for an unknown or missing token', async () => {
    const unknown = createRotationHarness({ token: null });
    await expect(unknown.service.logout('unknown')).resolves.toBeUndefined();
    expect(unknown.prisma.authSession.updateMany).not.toHaveBeenCalled();

    const missing = createRotationHarness();
    await expect(missing.service.logout(undefined)).resolves.toBeUndefined();
    expect(missing.prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('does not revoke through the cookie when browser auth is disabled', async () => {
    const { service, prisma } = createRotationHarness({
      browserAuthEnabled: false,
    });

    await expect(service.logout(PRESENTED_REFRESH)).resolves.toBeUndefined();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService profile and sessions', () => {
  it('updates the caller name', async () => {
    const { service, prisma } = createHarness();

    const result = await service.updateProfile('user-1', {
      firstName: 'Grace',
      lastName: 'Hopper',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Grace', lastName: 'Hopper' },
    });
    expect(result.user).toMatchObject({
      firstName: 'Grace',
      lastName: 'Hopper',
    });
  });

  it('changes the password and revokes the other sessions', async () => {
    const { service, tx } = createHarness();

    await service.changePassword('user-1', 'session-current', {
      currentPassword: 'old-password',
      newPassword: 'a-new-password',
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'dummy-password-hash' },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: { not: 'session-current' },
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects a wrong current password', async () => {
    const { service } = createHarness({ passwordMatches: false });

    await expect(
      service.changePassword('user-1', 'session-current', {
        currentPassword: 'wrong-password',
        newPassword: 'a-new-password',
      }),
    ).rejects.toThrow('Current password is incorrect');
  });

  it('lists active sessions and marks the current one', async () => {
    const { service, prisma } = createHarness();
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');
    prisma.authSession.findMany.mockResolvedValueOnce([
      {
        id: 'session-current',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        expiresAt,
        userAgent: 'agent',
        ipAddress: '127.0.0.1',
      },
    ]);

    const result = await service.listSessions('user-1', 'session-current');

    expect(result.sessions).toEqual([
      {
        id: 'session-current',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: null,
        expiresAt: expiresAt.toISOString(),
        userAgent: 'agent',
        ipAddress: '127.0.0.1',
        current: true,
      },
    ]);
  });

  it('refuses to revoke the current session', async () => {
    const { service } = createHarness();

    await expect(
      service.revokeSession('user-1', 'session-current', 'session-current'),
    ).rejects.toThrow('Use sign out to end the current session');
  });

  it('returns 404 when revoking an unknown session', async () => {
    const { service, prisma } = createHarness();
    prisma.authSession.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.revokeSession('user-1', 'session-other', 'session-current'),
    ).rejects.toThrow('Session not found');
  });
});
