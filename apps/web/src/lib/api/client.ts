import { refreshCoordinator, type RefreshOutcomeStatus } from '~/lib/auth/refresh';
import { buildCsrfHeaders, isUnsafeMethod, readCsrfToken } from './csrf';
import { ApiError, NETWORK_ERROR_STATUS, toApiError } from './errors';
import { resolveUrl } from './url';

export { resolveUrl };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiFetchOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  authRecovery?: boolean;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiStreamOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const JSON_CONTENT_TYPE = 'application/json';
const NDJSON_CONTENT_TYPE = 'application/x-ndjson';
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;

interface RecoveryResult {
  response: Response;
  recoveryOutcome?: RefreshOutcomeStatus;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const url = resolveUrl(path);
  const csrfTokenUsed = isUnsafeMethod(method) ? readCsrfToken() : undefined;

  let response = await send(url, method, options);
  let recoveryOutcome: RefreshOutcomeStatus | undefined;

  if (options.authRecovery === true) {
    const recovered = await applyRecovery(
      url,
      method,
      options,
      csrfTokenUsed,
      response,
    );
    response = recovered.response;
    recoveryOutcome = recovered.recoveryOutcome;
  }

  return readResponse<T>(response, recoveryOutcome);
}

export async function apiStream(
  path: string,
  options: ApiStreamOptions = {},
): Promise<Response> {
  const method = options.method ?? 'POST';
  const url = resolveUrl(path);
  const csrfTokenUsed = isUnsafeMethod(method) ? readCsrfToken() : undefined;

  let response = await sendStream(url, method, options);

  if (response.status === UNAUTHORIZED_STATUS) {
    const outcome = await refreshCoordinator.refresh({ signal: options.signal });

    if (outcome.status === 'refreshed' || outcome.status === 'already-valid') {
      response = await sendStream(url, method, options);
    }
  } else if (response.status === FORBIDDEN_STATUS && isUnsafeMethod(method)) {
    const currentToken = readCsrfToken();

    if (currentToken !== undefined && currentToken !== csrfTokenUsed) {
      response = await sendStream(url, method, options);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw toApiError(response.status, parseJsonOrUndefined(text));
  }

  return response;
}

async function sendStream(
  url: string,
  method: HttpMethod,
  options: ApiStreamOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: NDJSON_CONTENT_TYPE,
    ...buildCsrfHeaders(method),
    ...options.headers,
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = JSON_CONTENT_TYPE;
    body = JSON.stringify(options.body);
  }

  try {
    return await fetch(url, {
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
}

async function applyRecovery(
  url: string,
  method: HttpMethod,
  options: ApiFetchOptions,
  csrfTokenUsed: string | undefined,
  response: Response,
): Promise<RecoveryResult> {
  if (response.status === UNAUTHORIZED_STATUS) {
    const outcome = await refreshCoordinator.refresh({ signal: options.signal });

    if (outcome.status === 'refreshed' || outcome.status === 'already-valid') {
      return {
        response: await send(url, method, { ...options, authRecovery: false }),
        recoveryOutcome: outcome.status,
      };
    }

    return { response, recoveryOutcome: outcome.status };
  }

  if (response.status === FORBIDDEN_STATUS && isUnsafeMethod(method)) {
    const currentToken = readCsrfToken();

    if (currentToken !== undefined && currentToken !== csrfTokenUsed) {
      return {
        response: await send(url, method, { ...options, authRecovery: false }),
      };
    }

    return { response };
  }

  return { response };
}

async function send(
  url: string,
  method: HttpMethod,
  options: ApiFetchOptions,
): Promise<Response> {
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

  try {
    return await fetch(url, {
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
}

async function readResponse<T>(
  response: Response,
  recoveryOutcome?: RefreshOutcomeStatus,
): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (!response.ok) {
    throw toApiError(response.status, parseJsonOrUndefined(text), recoveryOutcome);
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
