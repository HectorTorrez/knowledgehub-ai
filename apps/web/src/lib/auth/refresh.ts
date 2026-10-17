import { resolveUrl } from '~/lib/api/client';
import { buildCsrfHeaders } from '~/lib/api/csrf';
import { ApiError, NETWORK_ERROR_STATUS, toApiError } from '~/lib/api/errors';

export const REFRESH_LOCK_NAME = 'knowledgehub:auth:refresh';

const SESSION_PATH = '/auth/session';
const REFRESH_PATH = '/auth/refresh';
const JSON_CONTENT_TYPE = 'application/json';
const OK_STATUS = 200;
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;

type HttpMethod = 'GET' | 'POST';

export type RefreshOutcome =
  | { status: 'refreshed' }
  | { status: 'already-valid' }
  | { status: 'unauthenticated'; error: ApiError }
  | { status: 'forbidden'; error: ApiError }
  | { status: 'network-error'; error: ApiError }
  | { status: 'failure'; error: ApiError }
  | { status: 'unsupported' };

export interface RefreshCoordinator {
  refresh(options?: { signal?: AbortSignal }): Promise<RefreshOutcome>;
}

type ProbeOutcome =
  | { kind: 'valid' }
  | { kind: 'expired' }
  | { kind: 'forbidden'; error: ApiError }
  | { kind: 'network-error'; error: ApiError }
  | { kind: 'failure'; error: ApiError };

type RequestResult =
  | { kind: 'ok'; status: number }
  | { kind: 'error'; error: ApiError };

export function createRefreshCoordinator(): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null;

  return {
    refresh(options = {}) {
      const { signal } = options;

      if (signal?.aborted) {
        return Promise.reject(abortError());
      }

      const shared =
        inFlight ??
        (inFlight = runSharedRefresh().finally(() => {
          inFlight = null;
        }));

      return waitForSharedRefresh(shared, signal);
    },
  };
}

export const refreshCoordinator = createRefreshCoordinator();

async function runSharedRefresh(): Promise<RefreshOutcome> {
  if (!isBrowser()) {
    return { status: 'unsupported' };
  }

  try {
    return await runWithLock();
  } catch (error) {
    return { status: 'failure', error: toTransportError(error) };
  }
}

async function runWithLock(): Promise<RefreshOutcome> {
  const locks = getWebLocks();

  if (locks === undefined) {
    return runWithoutLock();
  }

  return locks.request(REFRESH_LOCK_NAME, () => runLocked());
}

async function runLocked(): Promise<RefreshOutcome> {
  const probe = await probeSession();

  switch (probe.kind) {
    case 'valid':
      return { status: 'already-valid' };
    case 'expired':
      return rotate();
    case 'forbidden':
      return { status: 'forbidden', error: probe.error };
    case 'network-error':
      return { status: 'network-error', error: probe.error };
    case 'failure':
      return { status: 'failure', error: probe.error };
  }
}

async function runWithoutLock(): Promise<RefreshOutcome> {
  const probe = await probeSession();

  switch (probe.kind) {
    case 'valid':
      return { status: 'already-valid' };
    case 'expired':
      return { status: 'unsupported' };
    case 'forbidden':
      return { status: 'forbidden', error: probe.error };
    case 'network-error':
      return { status: 'network-error', error: probe.error };
    case 'failure':
      return { status: 'failure', error: probe.error };
  }
}

async function probeSession(): Promise<ProbeOutcome> {
  const result = await perform(SESSION_PATH, 'GET');

  if (result.kind === 'ok') {
    return result.status === OK_STATUS
      ? { kind: 'valid' }
      : { kind: 'failure', error: toApiError(result.status, undefined) };
  }

  switch (result.error.status) {
    case UNAUTHORIZED_STATUS:
      return { kind: 'expired' };
    case FORBIDDEN_STATUS:
      return { kind: 'forbidden', error: result.error };
    case NETWORK_ERROR_STATUS:
      return { kind: 'network-error', error: result.error };
    default:
      return { kind: 'failure', error: result.error };
  }
}

async function rotate(): Promise<RefreshOutcome> {
  const result = await perform(REFRESH_PATH, 'POST');

  if (result.kind === 'ok') {
    return result.status === OK_STATUS
      ? { status: 'refreshed' }
      : { status: 'failure', error: toApiError(result.status, undefined) };
  }

  switch (result.error.status) {
    case UNAUTHORIZED_STATUS:
      return { status: 'unauthenticated', error: result.error };
    case FORBIDDEN_STATUS:
      return { status: 'forbidden', error: result.error };
    case NETWORK_ERROR_STATUS:
      return { status: 'network-error', error: result.error };
    default:
      return { status: 'failure', error: result.error };
  }
}

async function perform(
  path: string,
  method: HttpMethod,
): Promise<RequestResult> {
  let response: Response;

  try {
    response = await fetch(resolveUrl(path), {
      method,
      headers: {
        Accept: JSON_CONTENT_TYPE,
        ...buildCsrfHeaders(method),
      },
      credentials: 'include',
    });
  } catch (error) {
    return { kind: 'error', error: toTransportError(error) };
  }

  if (response.ok) {
    return { kind: 'ok', status: response.status };
  }

  try {
    const text = await response.text();
    return {
      kind: 'error',
      error: toApiError(response.status, parseJsonOrUndefined(text)),
    };
  } catch (cause) {
    return {
      kind: 'error',
      error: new ApiError({
        status: response.status,
        message: 'The API returned an unreadable error response.',
        cause,
      }),
    };
  }
}

function getWebLocks(): LockManager | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const locks = (navigator as { locks?: LockManager }).locks;

  return locks !== undefined && typeof locks.request === 'function'
    ? locks
    : undefined;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

function waitForSharedRefresh(
  shared: Promise<RefreshOutcome>,
  signal: AbortSignal | undefined,
): Promise<RefreshOutcome> {
  if (signal === undefined) {
    return shared;
  }

  return new Promise<RefreshOutcome>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (outcome) => {
        cleanup();
        resolve(outcome);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function toTransportError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError({
    status: NETWORK_ERROR_STATUS,
    message: 'Unable to reach the API.',
    cause: error,
  });
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
