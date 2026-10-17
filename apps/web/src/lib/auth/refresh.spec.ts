import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_COOKIE, CSRF_HEADER } from '~/lib/api/csrf';
import { REFRESH_LOCK_NAME, createRefreshCoordinator } from './refresh';

const USER = {
  id: 'user-1',
  email: 'ada@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CSRF_VALUE = 'csrf-token-1';

type ProbeMode =
  | 'auto'
  | 'valid'
  | 'expired'
  | 'forbidden'
  | 'network'
  | 'server-error';

type RefreshMode =
  | 'auto'
  | 'ok'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'server-error';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ statusCode: status, message, error: 'Error' }, status);
}

function createLockManager() {
  const queues = new Map<string, Array<() => void>>();
  const held = new Set<string>();

  function acquire(name: string): Promise<void> {
    if (!held.has(name)) {
      held.add(name);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const queue = queues.get(name) ?? [];
      queue.push(() => {
        held.add(name);
        resolve();
      });
      queues.set(name, queue);
    });
  }

  function release(name: string): void {
    held.delete(name);
    const queue = queues.get(name);
    const next = queue?.shift();

    if (next) {
      next();
      return;
    }

    queues.delete(name);
  }

  const request = vi.fn(
    async (name: string, callback: () => Promise<unknown>): Promise<unknown> => {
      await acquire(name);
      try {
        return await callback();
      } finally {
        release(name);
      }
    },
  );

  return { request, isLocked: (name: string) => held.has(name) };
}

function createHarness() {
  const state = {
    sessionValid: false,
    probe: 'auto' as ProbeMode,
    refresh: 'auto' as RefreshMode,
    sessionCalls: 0,
    refreshCalls: 0,
    refreshGate: null as Promise<void> | null,
    releaseRefresh: null as (() => void) | null,
    sessionRequest: undefined as RequestInit | undefined,
    refreshRequest: undefined as RequestInit | undefined,
  };

  function probeResponse(): Response {
    if (state.probe === 'network') {
      throw new TypeError('Failed to fetch');
    }
    if (state.probe === 'valid') {
      return jsonResponse({ user: USER });
    }
    if (state.probe === 'expired') {
      return errorResponse(401, 'Authentication required');
    }
    if (state.probe === 'forbidden') {
      return errorResponse(403, 'Invalid or missing CSRF token');
    }
    if (state.probe === 'server-error') {
      return errorResponse(500, 'Server error');
    }

    return state.sessionValid
      ? jsonResponse({ user: USER })
      : errorResponse(401, 'Authentication required');
  }

  function refreshResponse(): Response {
    if (state.refresh === 'network') {
      throw new TypeError('Failed to fetch');
    }
    if (state.refresh === 'unauthorized') {
      return errorResponse(401, 'Invalid or expired refresh token');
    }
    if (state.refresh === 'forbidden') {
      return errorResponse(403, 'Invalid or missing CSRF token');
    }
    if (state.refresh === 'server-error') {
      return errorResponse(500, 'Server error');
    }

    state.sessionValid = true;
    return jsonResponse({ user: USER });
  }

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.endsWith('/auth/session') && method === 'GET') {
      state.sessionCalls += 1;
      state.sessionRequest = init ?? undefined;
      return probeResponse();
    }

    if (url.endsWith('/auth/refresh') && method === 'POST') {
      state.refreshCalls += 1;
      state.refreshRequest = init ?? undefined;

      if (state.refreshGate) {
        await state.refreshGate;
      }

      return refreshResponse();
    }

    return errorResponse(404, 'Not found');
  });

  return {
    fetchMock,
    state,
    holdRefresh(): void {
      state.refreshGate = new Promise<void>((resolve) => {
        state.releaseRefresh = resolve;
      });
    },
    releaseRefresh(): void {
      state.releaseRefresh?.();
      state.releaseRefresh = null;
    },
    refreshHeaders(): Headers {
      return new Headers(state.refreshRequest?.headers);
    },
    sessionHeaders(): Headers {
      return new Headers(state.sessionRequest?.headers);
    },
  };
}

let harness: ReturnType<typeof createHarness>;
let locks: ReturnType<typeof createLockManager>;

function setupBrowser(options: { webLocks?: boolean } = {}): void {
  harness = createHarness();
  locks = createLockManager();

  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { cookie: `${CSRF_COOKIE}=${CSRF_VALUE}` });
  vi.stubGlobal('fetch', harness.fetchMock);
  vi.stubGlobal('navigator', options.webLocks === false ? {} : { locks });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshCoordinator', () => {
  it('performs one probe and refresh for concurrent callers in a single tab', async () => {
    setupBrowser();
    const coordinator = createRefreshCoordinator();

    const outcomes = await Promise.all([
      coordinator.refresh(),
      coordinator.refresh(),
      coordinator.refresh(),
    ]);

    expect(outcomes).toEqual([
      { status: 'refreshed' },
      { status: 'refreshed' },
      { status: 'refreshed' },
    ]);
    expect(harness.state.sessionCalls).toBe(1);
    expect(harness.state.refreshCalls).toBe(1);
  });

  it('lets a waiting tab observe another tab refresh without rotating again', async () => {
    setupBrowser();
    harness.holdRefresh();

    const tabA = createRefreshCoordinator();
    const tabB = createRefreshCoordinator();

    const first = tabA.refresh();
    await vi.waitFor(() => expect(harness.state.refreshCalls).toBe(1));

    const second = tabB.refresh();
    await vi.waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));

    harness.releaseRefresh();

    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    expect(firstOutcome).toEqual({ status: 'refreshed' });
    expect(secondOutcome).toEqual({ status: 'already-valid' });
    expect(harness.state.refreshCalls).toBe(1);
    expect(harness.state.sessionCalls).toBe(2);
  });

  it('treats a valid session probe as already valid without rotating', async () => {
    setupBrowser();
    harness.state.probe = 'valid';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toEqual({ status: 'already-valid' });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('does not rotate when the probe is forbidden', async () => {
    setupBrowser();
    harness.state.probe = 'forbidden';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({ status: 'forbidden', error: { status: 403 } });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('does not rotate when the probe fails at the transport layer', async () => {
    setupBrowser();
    harness.state.probe = 'network';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({ status: 'network-error', error: { status: 0 } });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('does not rotate on an unexpected probe status', async () => {
    setupBrowser();
    harness.state.probe = 'server-error';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({ status: 'failure', error: { status: 500 } });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('reports an unusable refresh session without retrying or logging out', async () => {
    setupBrowser();
    harness.state.refresh = 'unauthorized';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({
      status: 'unauthenticated',
      error: { status: 401 },
    });
    expect(harness.state.refreshCalls).toBe(1);
  });

  it('allows a later attempt after a failed refresh', async () => {
    setupBrowser();
    const coordinator = createRefreshCoordinator();
    harness.state.refresh = 'unauthorized';

    const failed = await coordinator.refresh();
    expect(failed.status).toBe('unauthenticated');

    harness.state.refresh = 'ok';
    const recovered = await coordinator.refresh();

    expect(recovered).toEqual({ status: 'refreshed' });
    expect(harness.state.refreshCalls).toBe(2);
  });

  it('reports a forbidden refresh without retrying', async () => {
    setupBrowser();
    harness.state.refresh = 'forbidden';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({
      status: 'forbidden',
      error: { status: 403 },
    });
    expect(harness.state.refreshCalls).toBe(1);
  });

  it('reports a refresh transport failure without treating it as unauthenticated', async () => {
    setupBrowser();
    harness.state.refresh = 'network';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({
      status: 'network-error',
      error: { status: 0 },
    });
  });

  it('reports an unexpected refresh status as a failure', async () => {
    setupBrowser();
    harness.state.refresh = 'server-error';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({
      status: 'failure',
      error: { status: 500 },
    });
  });

  it('detaches an aborted caller while the shared refresh completes', async () => {
    setupBrowser();
    harness.holdRefresh();
    const coordinator = createRefreshCoordinator();
    const controller = new AbortController();

    const aborted = coordinator.refresh({ signal: controller.signal });
    const other = coordinator.refresh();

    await vi.waitFor(() => expect(harness.state.refreshCalls).toBe(1));

    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });

    harness.releaseRefresh();

    await expect(other).resolves.toEqual({ status: 'refreshed' });
    expect(harness.state.refreshCalls).toBe(1);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    setupBrowser();
    const coordinator = createRefreshCoordinator();
    const controller = new AbortController();
    controller.abort();

    await expect(
      coordinator.refresh({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(harness.state.sessionCalls).toBe(0);
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('coordinates through the stable lock name', async () => {
    setupBrowser();
    const coordinator = createRefreshCoordinator();

    await coordinator.refresh();

    expect(locks.request).toHaveBeenCalledWith(
      REFRESH_LOCK_NAME,
      expect.any(Function),
    );
  });

  it('releases the lock after a failed refresh', async () => {
    setupBrowser();
    harness.state.refresh = 'unauthorized';
    const coordinator = createRefreshCoordinator();

    await coordinator.refresh();

    expect(locks.isLocked(REFRESH_LOCK_NAME)).toBe(false);
  });

  it('sends the CSRF header on the rotating request only', async () => {
    setupBrowser();
    const coordinator = createRefreshCoordinator();

    await coordinator.refresh();

    expect(harness.refreshHeaders().get(CSRF_HEADER)).toBe(CSRF_VALUE);
    expect(harness.sessionHeaders().get(CSRF_HEADER)).toBeNull();
  });

  it('uses a valid session probe without Web Locks and does not rotate', async () => {
    setupBrowser({ webLocks: false });
    harness.state.probe = 'valid';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toEqual({ status: 'already-valid' });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('fails closed without Web Locks when the session is invalid', async () => {
    setupBrowser({ webLocks: false });
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toEqual({ status: 'unsupported' });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('reports a probe failure without Web Locks and does not rotate', async () => {
    setupBrowser({ webLocks: false });
    harness.state.probe = 'forbidden';
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toMatchObject({ status: 'forbidden' });
    expect(harness.state.refreshCalls).toBe(0);
  });

  it('does not run outside a browser window', async () => {
    const coordinator = createRefreshCoordinator();

    const outcome = await coordinator.refresh();

    expect(outcome).toEqual({ status: 'unsupported' });
  });

  it('does not touch browser storage', async () => {
    setupBrowser();
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('browser storage was accessed');
        },
      },
    );
    vi.stubGlobal('localStorage', trap);
    vi.stubGlobal('sessionStorage', trap);

    const coordinator = createRefreshCoordinator();
    const outcome = await coordinator.refresh();

    expect(outcome).toEqual({ status: 'refreshed' });
  });
});
