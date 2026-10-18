import type { PublicUser } from '@knowledgehub/shared-types';
import { QueryClient } from '@tanstack/react-query';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { refreshCoordinator, type RefreshOutcome } from '~/lib/auth/refresh';
import { CSRF_COOKIE, CSRF_HEADER } from '~/lib/api/csrf';
import { ApiError, NETWORK_ERROR_STATUS } from '~/lib/api/errors';
import {
  SESSION_QUERY_KEY,
  createUnauthorizedHandler,
  login,
  logout,
  register,
  sessionQuery,
  type SessionState,
} from './session';

const API_ORIGIN = 'http://localhost:3001';

let fetchMock: Mock<typeof fetch>;
let refreshSpy: MockInstance<typeof refreshCoordinator.refresh>;
let documentStub: { cookie: string };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ statusCode: status, message, error: 'Error' }, { status });
}

function publicUser(id = 'user-1'): PublicUser {
  return {
    id,
    email: 'hector@example.com',
    firstName: 'Hector',
    lastName: 'Torrez',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function refreshReturns(outcome: RefreshOutcome): void {
  refreshSpy.mockResolvedValue(outcome);
}

function refreshFailure(error: ApiError): RefreshOutcome {
  return { status: 'unauthenticated', error };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function putSession(client: QueryClient, state: SessionState): void {
  client.setQueryData(sessionQuery.queryKey, state);
}

function sessionOptions() {
  return { ...sessionQuery, retry: false };
}

function callInit(index: number): RequestInit {
  const call = fetchMock.mock.calls[index];

  if (!call) {
    throw new Error(`fetch call ${index} is missing`);
  }

  return call[1] ?? {};
}

function callHeaders(index: number): Headers {
  return new Headers(callInit(index).headers);
}

function caught(): (error: unknown) => unknown {
  return (error: unknown) => error;
}

function throwOnStorageAccess(): void {
  for (const key of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        throw new Error(`${key} must not be accessed`);
      },
    });
  }
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  documentStub = { cookie: `${CSRF_COOKIE}=csrf-1` };

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', { location: { origin: API_ORIGIN } });
  refreshSpy = vi.spyOn(refreshCoordinator, 'refresh');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'sessionStorage');
});

describe('sessionQuery', () => {
  it('resolves an authenticated session from the session endpoint', async () => {
    const user = publicUser();
    fetchMock.mockResolvedValueOnce(jsonResponse({ user }));

    const state = await makeClient().fetchQuery(sessionQuery);

    expect(state).toEqual({ status: 'authenticated', user });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callInit(0).credentials).toBe('include');
  });

  it('recovers an expired access token by refreshing and retrying', async () => {
    const user = publicUser();
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(jsonResponse({ user }));
    refreshReturns({ status: 'refreshed' });

    const state = await makeClient().fetchQuery(sessionQuery);

    expect(state).toEqual({ status: 'authenticated', user });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves unauthenticated when the refresh session is gone', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns(
      refreshFailure(
        new ApiError({ status: 401, message: 'Invalid or expired refresh token' }),
      ),
    );

    await expect(makeClient().fetchQuery(sessionQuery)).resolves.toEqual({
      status: 'unauthenticated',
    });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each<RefreshOutcome['status']>(['refreshed', 'already-valid'])(
    'resolves unauthenticated when a successful recovery (%s) still returns 401',
    async (outcome) => {
      fetchMock
        .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
        .mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
      refreshReturns({ status: outcome } as RefreshOutcome);

      await expect(makeClient().fetchQuery(sessionQuery)).resolves.toEqual({
        status: 'unauthenticated',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each<[string, RefreshOutcome]>([
    [
      'forbidden',
      {
        status: 'forbidden',
        error: new ApiError({ status: 403, message: 'Invalid or missing CSRF token' }),
      },
    ],
    [
      'network-error',
      { status: 'network-error', error: new ApiError({ status: NETWORK_ERROR_STATUS, message: 'down' }) },
    ],
    [
      'failure',
      { status: 'failure', error: new ApiError({ status: 500, message: 'boom' }) },
    ],
    ['unsupported', { status: 'unsupported' }],
  ])('throws instead of signing out when recovery fails with %s', async (name, outcome) => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns(outcome);

    const error = await makeClient()
      .fetchQuery(sessionOptions())
      .catch(caught());

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, recoveryOutcome: name });
  });

  it('throws when the session request cannot reach the API', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await makeClient()
      .fetchQuery(sessionOptions())
      .catch(caught());

    expect(error).toMatchObject({ status: NETWORK_ERROR_STATUS });
  });

  it('throws on a server error and never attempts recovery', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(503, 'Service unavailable'));

    const error = await makeClient()
      .fetchQuery(sessionOptions())
      .catch(caught());

    expect(error).toMatchObject({ status: 503 });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to resolve a session outside the browser', async () => {
    vi.stubGlobal('window', undefined);

    await expect(
      makeClient().fetchQuery(sessionOptions()),
    ).rejects.toThrow(/browser/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries transport and server errors but never an unauthorized response', () => {
    const retry = sessionQuery.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;

    expect(retry(0, new ApiError({ status: NETWORK_ERROR_STATUS, message: 'down' }))).toBe(true);
    expect(retry(0, new ApiError({ status: 503, message: 'down' }))).toBe(true);
    expect(retry(0, new ApiError({ status: 401, message: 'nope' }))).toBe(false);
    expect(retry(0, new ApiError({ status: 403, message: 'nope' }))).toBe(false);
    expect(retry(1, new ApiError({ status: NETWORK_ERROR_STATUS, message: 'down' }))).toBe(false);
    expect(retry(0, new DOMException('The operation was aborted.', 'AbortError'))).toBe(false);
    expect(retry(0, new Error('outside the browser'))).toBe(false);
  });
});

describe('login', () => {
  it('establishes the new identity and purges the previous session cache', async () => {
    const client = makeClient();
    const previousUser = publicUser('user-a');
    const nextUser = publicUser('user-b');
    putSession(client, {
      status: 'authenticated',
      user: previousUser,
    });
    client.setQueryData(['organizations', 'org-1', 'documents'], ['secret']);
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: nextUser }));

    const user = await login(client, {
      email: 'hector@example.com',
      password: 'correct-horse-battery',
    });

    expect(user).toEqual(nextUser);
    expect(
      client.getQueryData(['organizations', 'org-1', 'documents']),
    ).toBeUndefined();
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user: nextUser,
    });
    expect(callInit(0).method).toBe('POST');
    expect(callHeaders(0).get(CSRF_HEADER)).toBe('csrf-1');
  });

  it('does not touch the session cache when login fails', async () => {
    const client = makeClient();
    const user = publicUser();
    putSession(client, {
      status: 'authenticated',
      user,
    });
    fetchMock.mockResolvedValueOnce(
      errorResponse(401, 'Invalid email or password'),
    );

    await expect(
      login(client, { email: 'hector@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user,
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  it('establishes the new identity and purges the previous session cache', async () => {
    const client = makeClient();
    const nextUser = publicUser('user-c');
    client.setQueryData(['organizations'], ['data']);
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: nextUser }));

    const user = await register(client, {
      email: 'hector@example.com',
      password: 'correct-horse-battery',
      firstName: 'Hector',
      lastName: 'Torrez',
    });

    expect(user).toEqual(nextUser);
    expect(client.getQueryData(['organizations'])).toBeUndefined();
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user: nextUser,
    });
    expect(callInit(0).method).toBe('POST');
    expect(callHeaders(0).get(CSRF_HEADER)).toBe('csrf-1');
  });
});

describe('logout', () => {
  it('clears the cache and marks the session unauthenticated', async () => {
    const client = makeClient();
    putSession(client, {
      status: 'authenticated',
      user: publicUser(),
    });
    client.setQueryData(['organizations'], ['data']);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await logout(client);

    expect(client.getQueryData(['organizations'])).toBeUndefined();
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'unauthenticated',
    });
    expect(callHeaders(0).get(CSRF_HEADER)).toBe('csrf-1');
  });

  it.each<[string, Response]>([
    ['403', errorResponse(403, 'Invalid or missing CSRF token')],
    ['500', errorResponse(500, 'Server error')],
  ])('keeps the session when logout fails with %s', async (_name, response) => {
    const client = makeClient();
    const user = publicUser();
    putSession(client, {
      status: 'authenticated',
      user,
    });
    fetchMock.mockResolvedValueOnce(response);

    await expect(logout(client)).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user,
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('keeps the session when the API is unreachable', async () => {
    const client = makeClient();
    const user = publicUser();
    putSession(client, {
      status: 'authenticated',
      user,
    });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(logout(client)).rejects.toMatchObject({
      status: NETWORK_ERROR_STATUS,
    });

    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user,
    });
  });
});

describe('createUnauthorizedHandler', () => {
  it('purges the cache when recovery proves the session ended', () => {
    const client = makeClient();
    putSession(client, {
      status: 'authenticated',
      user: publicUser(),
    });
    client.setQueryData(['organizations'], ['data']);

    createUnauthorizedHandler(client)(
      new ApiError({
        status: 401,
        message: 'Authentication required',
        recoveryOutcome: 'unauthenticated',
      }),
    );

    expect(client.getQueryData(['organizations'])).toBeUndefined();
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'unauthenticated',
    });
  });

  it.each<[string, unknown]>([
    ['a failed login', new ApiError({ status: 401, message: 'Invalid email or password' })],
    [
      'a forbidden refresh',
      new ApiError({ status: 401, message: 'Authentication required', recoveryOutcome: 'forbidden' }),
    ],
    [
      'an unsupported refresh',
      new ApiError({ status: 401, message: 'Authentication required', recoveryOutcome: 'unsupported' }),
    ],
    ['a server error', new ApiError({ status: 500, message: 'Server error' })],
    ['a non-API error', new Error('boom')],
  ])('ignores %s', (_name, error) => {
    const client = makeClient();
    const user = publicUser();
    putSession(client, {
      status: 'authenticated',
      user,
    });

    createUnauthorizedHandler(client)(error);

    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'authenticated',
      user,
    });
  });
});

describe('session storage isolation', () => {
  it('never reads or writes web storage', async () => {
    throwOnStorageAccess();
    const client = makeClient();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: publicUser() }))
      .mockResolvedValueOnce(jsonResponse({ user: publicUser() }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.fetchQuery(sessionQuery);
    await login(client, { email: 'hector@example.com', password: 'correct-horse-battery' });
    await logout(client);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
