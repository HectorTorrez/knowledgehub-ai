import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';

/** A syntactically valid UUID used as the route organization id. */
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

interface FakeRequest {
  auth?: { userId: string; sessionId: string };
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  organizationContext?: OrganizationContext;
}

function authenticatedRequest(
  overrides: Partial<FakeRequest> = {},
): FakeRequest {
  return {
    auth: { userId: 'user-1', sessionId: 'session-1' },
    params: { organizationId: ORGANIZATION_ID },
    ...overrides,
  };
}

function context(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function membershipRow(role: 'OWNER' | 'MEMBER' = 'OWNER') {
  return {
    id: 'membership-1',
    userId: 'user-1',
    organizationId: ORGANIZATION_ID,
    role,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    organization: {
      id: ORGANIZATION_ID,
      name: 'Acme Inc.',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };
}

function buildGuard(options: { membership?: unknown } = {}) {
  const findUnique = vi.fn(async () =>
    options.membership === undefined ? membershipRow() : options.membership,
  );

  const prisma = {
    membership: { findUnique },
  } as unknown as PrismaService;

  return { guard: new OrganizationMembershipGuard(prisma), findUnique };
}

describe('OrganizationMembershipGuard', () => {
  it('rejects a request with no authenticated context', async () => {
    const { guard, findUnique } = buildGuard();
    const request = authenticatedRequest({ auth: undefined });

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a request with no organization id parameter', async () => {
    const { guard, findUnique } = buildGuard();
    const request = authenticatedRequest({ params: {} });

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a malformed organization id with 400', async () => {
    const { guard, findUnique } = buildGuard();

    const malformed = [
      'not-a-uuid',
      '123',
      '11111111111111111111111111111111',
      '11111111-1111-4111-8111-11111111111z',
      '',
    ];

    for (const organizationId of malformed) {
      const request = authenticatedRequest({
        params: { organizationId },
      });
      await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks up membership using both the session user and the route organization', async () => {
    const { guard, findUnique } = buildGuard();

    await guard.canActivate(context(authenticatedRequest()));

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'user-1',
          organizationId: ORGANIZATION_ID,
        },
      },
      include: { organization: true },
    });
  });

  it('rejects a non-member with 403', async () => {
    const { guard } = buildGuard({ membership: null });

    await expect(
      guard.canActivate(context(authenticatedRequest())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches the authorized organization and membership context for a member', async () => {
    const { guard } = buildGuard();
    const request = authenticatedRequest();

    await expect(guard.canActivate(context(request))).resolves.toBe(true);

    expect(request).toHaveProperty('organizationContext');
    expect(request.organizationContext).toEqual({
      organizationId: ORGANIZATION_ID,
      userId: 'user-1',
      role: 'OWNER',
      organization: {
        id: ORGANIZATION_ID,
        name: 'Acme Inc.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });
  });

  it('attaches the actual role from the membership row', async () => {
    const { guard } = buildGuard({ membership: membershipRow('MEMBER') });
    const request = authenticatedRequest();

    await guard.canActivate(context(request));

    expect(request.organizationContext?.role).toBe('MEMBER');
  });

  it('does not trust client-supplied role or organization data', async () => {
    const { guard, findUnique } = buildGuard({
      membership: membershipRow('MEMBER'),
    });
    const request = authenticatedRequest({
      query: { organizationId: OTHER_ORGANIZATION_ID, role: 'OWNER' },
      body: { organizationId: OTHER_ORGANIZATION_ID, role: 'OWNER' },
    });

    await guard.canActivate(context(request));

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: 'user-1',
            organizationId: ORGANIZATION_ID,
          },
        },
      }),
    );
    expect(request.organizationContext?.organizationId).toBe(ORGANIZATION_ID);
    expect(request.organizationContext?.role).toBe('MEMBER');
  });

  it('resolves membership on every request without caching', async () => {
    const { guard, findUnique } = buildGuard();

    await guard.canActivate(context(authenticatedRequest()));
    await guard.canActivate(context(authenticatedRequest()));

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects the next request once membership is gone', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(membershipRow())
      .mockResolvedValueOnce(null);
    const prisma = {
      membership: { findUnique },
    } as unknown as PrismaService;
    const guard = new OrganizationMembershipGuard(prisma);

    await expect(
      guard.canActivate(context(authenticatedRequest())),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context(authenticatedRequest())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
