import { API_BASE_URL } from '~/lib/config';
import { buildCsrfHeaders } from './csrf';
import { ApiError, NETWORK_ERROR_STATUS, toApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiFetchOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const JSON_CONTENT_TYPE = 'application/json';

const RELATIVE_PATH_MESSAGE =
  'API paths must be relative to the API origin and start with a single "/", for example "/health".';

export function resolveUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(RELATIVE_PATH_MESSAGE);
  }

  const url = new URL(path, API_BASE_URL);

  if (url.origin !== API_BASE_URL) {
    throw new Error(RELATIVE_PATH_MESSAGE);
  }

  return url.toString();
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: JSON_CONTENT_TYPE,
    ...buildCsrfHeaders(method),
    ...options.headers,
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = JSON_CONTENT_TYPE;
    body = JSON.stringify(options.body);
  }

  const url = resolveUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ApiError({
      status: NETWORK_ERROR_STATUS,
      message: 'Unable to reach the API.',
      cause: error,
    });
  }

  return readResponse<T>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (!response.ok) {
    throw toApiError(response.status, parseJsonOrUndefined(text));
  }

  if (text.trim().length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiError({
      status: response.status,
      message: 'The API returned an invalid JSON response.',
      cause,
    });
  }
}

function parseJsonOrUndefined(text: string): unknown {
  if (text.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}
