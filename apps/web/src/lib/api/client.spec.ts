import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { apiFetch, resolveUrl } from './client';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { ApiError, NETWORK_ERROR_STATUS } from './errors';

const API_ORIGIN = 'http://localhost:3001';

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', { cookie: `${CSRF_COOKIE}=csrf-1` });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function lastInit(): RequestInit {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }

  return call[1] ?? {};
}

function lastHeaders(): Headers {
  return new Headers(lastInit().headers);
}

describe('resolveUrl', () => {
  it('resolves a relative API path against the configured origin', () => {
    expect(resolveUrl('/health')).toBe(`${API_ORIGIN}/health`);
    expect(resolveUrl('/organizations/abc/documents')).toBe(
      `${API_ORIGIN}/organizations/abc/documents`,
    );
  });

  it('rejects an absolute external URL', () => {
    expect(() => resolveUrl('https://evil.example.com/steal')).toThrow(
      /relative to the API origin/,
    );
  });

  it('rejects a protocol-relative URL', () => {
    expect(() => resolveUrl('//evil.example.com/steal')).toThrow(
      /relative to the API origin/,
    );
  });

  it('rejects a path without a leading slash', () => {
    expect(() => resolveUrl('health')).toThrow(/relative to the API origin/);
  });

  it('rejects a path that escapes the API origin', () => {
    expect(() => resolveUrl('/\\/evil.example.com')).toThrow(
      /relative to the API origin/,
    );
  });
});

describe('apiFetch', () => {
  it('sends a credentialed GET with a JSON accept header and no CSRF token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    const result = await apiFetch<{ status: string }>('/health');

    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock.mock.calls.at(0)?.[0]).toBe(`${API_ORIGIN}/health`);

    const init = lastInit();
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();

    const headers = lastHeaders();
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get(CSRF_HEADER)).toBeNull();
  });

  it('attaches the CSRF header and JSON body for unsafe requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '1' }, { status: 201 }));

    await apiFetch('/organizations', {
      method: 'POST',
      body: { name: 'Acme' },
    });

    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Acme' }));

    const headers = lastHeaders();
    expect(headers.get(CSRF_HEADER)).toBe('csrf-1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('rejects an invalid path without calling fetch', async () => {
    await expect(apiFetch('https://evil.example.com/steal')).rejects.toThrow(
      /relative to the API origin/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const controller = new AbortController();

    await apiFetch('/health', { signal: controller.signal });

    expect(lastInit().signal).toBe(controller.signal);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      apiFetch('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined for an empty success body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(apiFetch('/health')).resolves.toBeUndefined();
  });

  it('rejects with an ApiError for a malformed JSON success body', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>not json</html>', { status: 200 }),
    );

    await expect(apiFetch('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'The API returned an invalid JSON response.',
    });
  });

  it('maps an error envelope with a string message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          statusCode: 403,
          message: 'You are not a member of this organization',
          error: 'Forbidden',
        },
        { status: 403 },
      ),
    );

    const error = await apiFetch('/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      message: 'You are not a member of this organization',
      validationErrors: [],
    });
  });

  it('maps an error envelope with an array message to validation errors', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          message: ['name: required', 'email: required'],
          error: 'Bad Request',
        },
        { status: 400 },
      ),
    );

    const error = (await apiFetch('/x').catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.validationErrors).toEqual([
      'name: required',
      'email: required',
    ]);
    expect(error.message).toBe('name: required; email: required');
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('gateway timeout', { status: 504 }));

    const error = (await apiFetch('/x').catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.status).toBe(504);
    expect(error.message).toBe('Request failed with status 504.');
  });

  it('wraps a network failure in an ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = (await apiFetch('/x').catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(NETWORK_ERROR_STATUS);
    expect(error.message).toBe('Unable to reach the API.');
  });

  it('rethrows an abort error unchanged', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abort);

    await expect(apiFetch('/x')).rejects.toBe(abort);
  });
});
