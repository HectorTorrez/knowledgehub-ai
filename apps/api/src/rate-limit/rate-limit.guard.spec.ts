import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type {
  RateLimitBudgetName,
  RateLimitConfig,
  RateLimitScope,
} from './rate-limit.config.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitStore } from './rate-limit.store.js';

interface FakeRequest {
  ip?: string;
  auth?: { userId: string; sessionId: string };
  organizationContext?: { organizationId: string };
}

interface FakeResponse {
  setHeader: ReturnType<typeof vi.fn>;
}

function createContext(request: FakeRequest): {
  context: ExecutionContext;
  response: FakeResponse;
} {
  const response: FakeResponse = { setHeader: vi.fn() };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, response };
}

function budgetFor(name: RateLimitBudgetName): {
  scope: RateLimitScope;
  limit: number;
  windowMs: number;
} {
  switch (name) {
    case 'login':
      return { scope: 'ip', limit: 10, windowMs: 60_000 };
    case 'search':
      return { scope: 'tenant', limit: 60, windowMs: 60_000 };
    case 'answerUser':
      return { scope: 'user', limit: 5, windowMs: 60_000 };
    case 'answerTenant':
      return { scope: 'tenant', limit: 20, windowMs: 60_000 };
  }
}

function createGuard(options: {
  budgets?: RateLimitBudgetName[];
  hitImpl?: (
    key: string,
    windowMs: number,
  ) => Promise<{ count: number; resetAtMs: number }>;
} = {}) {
  const reflector = {
    getAllAndOverride: vi.fn(() => options.budgets ?? undefined),
  } as unknown as Reflector;
  const config = {
    budget: vi.fn((name: RateLimitBudgetName) => budgetFor(name)),
  } as unknown as RateLimitConfig;
  const store = {
    hit: vi.fn(
      options.hitImpl ??
        (async () => ({ count: 1, resetAtMs: Date.now() + 60_000 })),
    ),
  } as unknown as RateLimitStore;

  return { guard: new RateLimitGuard(reflector, config, store), store };
}

describe('RateLimitGuard', () => {
  it('allows the request when no budget is declared', async () => {
    const { guard, store } = createGuard();
    const { context } = createContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.hit).not.toHaveBeenCalled();
  });

  it('keys login limits by IP', async () => {
    const { guard, store } = createGuard({ budgets: ['login'] });
    const { context } = createContext({ ip: '1.2.3.4' });

    await guard.canActivate(context);

    expect(store.hit).toHaveBeenCalledWith('ip:1.2.3.4', 60_000);
  });

  it('keys answer user limits by the authenticated user', async () => {
    const { guard, store } = createGuard({ budgets: ['answerUser'] });
    const { context } = createContext({
      ip: '1.2.3.4',
      auth: { userId: 'user-1', sessionId: 's-1' },
    });

    await guard.canActivate(context);

    expect(store.hit).toHaveBeenCalledWith('user:user-1', 60_000);
  });

  it('keys tenant limits by the organization', async () => {
    const { guard, store } = createGuard({ budgets: ['answerTenant'] });
    const { context } = createContext({
      ip: '1.2.3.4',
      auth: { userId: 'user-1', sessionId: 's-1' },
      organizationContext: { organizationId: 'org-1' },
    });

    await guard.canActivate(context);

    expect(store.hit).toHaveBeenCalledWith('tenant:org-1', 60_000);
  });

  it('skips a tenant budget when the organization context is missing', async () => {
    const { guard, store } = createGuard({ budgets: ['answerTenant'] });
    const { context } = createContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.hit).not.toHaveBeenCalled();
  });

  it('throws 429 with a Retry-After header when the limit is exceeded', async () => {
    const { guard } = createGuard({
      budgets: ['login'],
      hitImpl: async () => ({ count: 11, resetAtMs: Date.now() + 30_000 }),
    });
    const { context, response } = createContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.stringMatching(/^\d+$/),
    );
  });
});
