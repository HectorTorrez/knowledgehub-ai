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
import {
  refreshCoordinator,
  type RefreshOutcome,
} from '~/lib/auth/refresh';
import { apiFetch } from './client';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { ApiError } from './errors';

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
  return jsonResponse(
    { statusCode: status, message, error: 'Error' },
    { status },
  );
}

function refreshReturns(outcome: RefreshOutcome): void {
  refreshSpy.mockResolvedValue(outcome);
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

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  documentStub = { cookie: `${CSRF_COOKIE}=csrf-1` };

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', documentStub);
  refreshSpy = vi.spyOn(refreshCoordinator, 'refresh');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetch auth recovery', () => {
  it('does not attempt recovery unless explicitly enabled', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));

    const error = await apiFetch('/organizations').catch(caught());

    expect(error).toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes once and retries the original request on 401', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(jsonResponse({ organizations: [] }));
    refreshReturns({ status: 'refreshed' });

    const result = await apiFetch<{ organizations: unknown[] }>(
      '/organizations',
      { authRecovery: true },
    );

    expect(result).toEqual({ organizations: [] });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries when the coordinator reports an already-valid session', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    refreshReturns({ status: 'already-valid' });

    const result = await apiFetch<{ ok: boolean }>('/x', {
      authRecovery: true,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the original error when the refresh session is unusable', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({
      status: 'unauthenticated',
      error: new ApiError({
        status: 401,
        message: 'Invalid or expired refresh token',
      }),
    });

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh twice when the retried request is still unauthorized', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({ status: 'refreshed' });

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 401 });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt recovery for non-authentication failures', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'Server error'));

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 500 });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not recover authentication lifecycle calls by default', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'Authentication required'));

    for (const path of [
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/logout',
    ]) {
      await apiFetch(path, { method: 'POST', body: {} }).catch(() => undefined);
    }

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

describe('apiFetch CSRF recovery', () => {
  it('retries once when the CSRF token changed after a 403', async () => {
    fetchMock.mockImplementationOnce(async () => {
      documentStub.cookie = `${CSRF_COOKIE}=csrf-2`;
      return errorResponse(403, 'Invalid or missing CSRF token');
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: '1' }));

    const result = await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      authRecovery: true,
    });

    expect(result).toEqual({ id: '1' });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callHeaders(0).get(CSRF_HEADER)).toBe('csrf-1');
    expect(callHeaders(1).get(CSRF_HEADER)).toBe('csrf-2');
  });

  it('does not retry a 403 when the CSRF token is unchanged', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(403, 'Invalid or missing CSRF token'),
    );

    const error = await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      authRecovery: true,
    }).catch(caught());

    expect(error).toMatchObject({
      status: 403,
      message: 'Invalid or missing CSRF token',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 403 when no CSRF token is present', async () => {
    documentStub.cookie = '';
    fetchMock.mockResolvedValueOnce(
      errorResponse(403, 'Invalid or missing CSRF token'),
    );

    const error = await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      authRecovery: true,
    }).catch(caught());

    expect(error).toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not apply CSRF recovery to safe methods', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(403, 'You are not a member of this organization'),
    );

    const error = await apiFetch('/organizations/abc', {
      authRecovery: true,
    }).catch(caught());

    expect(error).toMatchObject({
      status: 403,
      message: 'You are not a member of this organization',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call the refresh coordinator for a 403', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(403, 'Invalid or missing CSRF token'),
    );

    await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      authRecovery: true,
    }).catch(caught());

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

describe('apiFetch retry fidelity', () => {
  it('preserves method, body, headers, credentials and signal on retry', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    refreshReturns({ status: 'refreshed' });

    await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      headers: { 'X-Custom': 'yes' },
      signal: controller.signal,
      authRecovery: true,
    });

    const retry = callInit(1);

    expect(retry.method).toBe('POST');
    expect(retry.body).toBe(JSON.stringify({ name: 'Acme' }));
    expect(new Headers(retry.headers).get('X-Custom')).toBe('yes');
    expect(new Headers(retry.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(retry.signal).toBe(controller.signal);
    expect(retry.credentials).toBe('include');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(fetchMock.mock.calls[0]?.[0]);
  });

  it('forwards the request signal to the refresh coordinator', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    refreshReturns({ status: 'already-valid' });

    await apiFetch('/x', { authRecovery: true, signal: controller.signal });

    expect(refreshSpy).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it('propagates an abort raised during recovery without retrying', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshSpy.mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    await expect(apiFetch('/x', { authRecovery: true })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetch recovery provenance', () => {
  it('records the refresh outcome when a 401 survives recovery', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({
      status: 'forbidden',
      error: new ApiError({ status: 403, message: 'Invalid or missing CSRF token' }),
    });

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 401, recoveryOutcome: 'forbidden' });
  });

  it('records a successful recovery on the retried response', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({ status: 'refreshed' });

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 401, recoveryOutcome: 'refreshed' });
  });

  it('leaves the outcome unset when recovery is disabled', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));

    const error = await apiFetch('/x').catch(caught());

    expect(error).toMatchObject({ status: 401 });
    expect((error as ApiError).recoveryOutcome).toBeUndefined();
  });

  it('leaves the outcome unset for a non-authentication failure', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'Server error'));

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect((error as ApiError).recoveryOutcome).toBeUndefined();
  });

  it.each<RefreshOutcome['status']>([
    'unauthenticated',
    'network-error',
    'failure',
    'unsupported',
  ])('records the %s outcome on a surviving 401', async (status) => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({ status } as RefreshOutcome);

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 401, recoveryOutcome: status });
  });

  it('records an already-valid recovery on the retried response', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'))
      .mockResolvedValueOnce(errorResponse(401, 'Authentication required'));
    refreshReturns({ status: 'already-valid' });

    const error = await apiFetch('/x', { authRecovery: true }).catch(caught());

    expect(error).toMatchObject({ status: 401, recoveryOutcome: 'already-valid' });
  });

  it('leaves the outcome unset when a CSRF 403 is retried', async () => {
    fetchMock.mockImplementationOnce(async () => {
      documentStub.cookie = `${CSRF_COOKIE}=csrf-2`;
      return errorResponse(403, 'Invalid or missing CSRF token');
    });
    fetchMock.mockResolvedValueOnce(errorResponse(403, 'Invalid or missing CSRF token'));

    const error = await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
      authRecovery: true,
    }).catch(caught());

    expect(error).toMatchObject({ status: 403 });
    expect((error as ApiError).recoveryOutcome).toBeUndefined();
  });
});
