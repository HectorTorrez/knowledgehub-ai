import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TokenService } from './token.service.js';
import type { AuthConfig } from './auth.config.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { SessionGuard } from './session.guard.js';

interface FakeRequest {
  cookies?: Record<string, string>;
  headers: Record<string, string>;
  auth?: { userId: string; sessionId: string };
}

const activeSession = {
  id: 'session-1',
  userId: 'user-1',
  revokedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 60_000),
};

function context(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(options: {
  session?: unknown;
  verify?: () => Promise<unknown>;
  browserAuthEnabled?: boolean;
} = {}) {
  const tokens = {
    verifyAccessToken: vi.fn(
      options.verify ??
        (async () => ({ sub: 'user-1', sid: 'session-1' })),
    ),
  } as unknown as TokenService;

  const prisma = {
    authSession: {
      findUnique: vi.fn(async () =>
        options.session === undefined ? activeSession : options.session,
      ),
    },
  } as unknown as PrismaService;

  const authConfig = {
    browserAuthEnabled: options.browserAuthEnabled ?? true,
  } as unknown as AuthConfig;

  return new SessionGuard(tokens, prisma, authConfig);
}

describe('SessionGuard', () => {
  it('accepts an active session and attaches auth context', async () => {
    const guard = buildGuard();
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.auth).toEqual({ userId: 'user-1', sessionId: 'session-1' });
  });

  it('accepts a Bearer token when no cookie is present', async () => {
    const guard = buildGuard();
    const request: FakeRequest = {
      headers: { authorization: 'Bearer valid-token' },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
  });

  it('rejects a request with no token', async () => {
    const guard = buildGuard();
    await expect(
      guard.canActivate(context({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid or expired token', async () => {
    const guard = buildGuard({
      verify: async () => {
        throw new Error('bad signature');
      },
    });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'bad-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session no longer exists', async () => {
    const guard = buildGuard({ session: null });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked session', async () => {
    const guard = buildGuard({
      session: { ...activeSession, revokedAt: new Date() },
    });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired session', async () => {
    const guard = buildGuard({
      session: { ...activeSession, expiresAt: new Date(Date.now() - 1_000) },
    });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session does not belong to the token subject', async () => {
    const guard = buildGuard({
      session: { ...activeSession, userId: 'someone-else' },
    });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a cookie token when browser authentication is disabled', async () => {
    const guard = buildGuard({ browserAuthEnabled: false });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'valid-token' },
      headers: {},
    };

    await expect(
      guard.canActivate(context(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('still accepts a bearer token when browser authentication is disabled', async () => {
    const guard = buildGuard({ browserAuthEnabled: false });
    const request: FakeRequest = {
      headers: { authorization: 'Bearer valid-token' },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.auth).toEqual({ userId: 'user-1', sessionId: 'session-1' });
  });

  it('prefers the bearer token over a cookie when both are present', async () => {
    const guard = buildGuard({ browserAuthEnabled: false });
    const request: FakeRequest = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'cookie-token' },
      headers: { authorization: 'Bearer header-token' },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
  });
});
