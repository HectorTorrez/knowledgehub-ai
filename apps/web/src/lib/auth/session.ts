import type {
  LoginRequest,
  LoginResponse,
  PublicUser,
  RegisterRequest,
  RegisterResponse,
  SessionResponse,
} from '@knowledgehub/shared-types';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from '~/lib/api/client';
import { isApiError, isNetworkError, isUnauthorized, type ApiError } from '~/lib/api/errors';

export const SESSION_QUERY_KEY = ['session'] as const;

const SESSION_PATH = '/auth/session';
const LOGIN_PATH = '/auth/login';
const REGISTER_PATH = '/auth/register';
const LOGOUT_PATH = '/auth/logout';
const SESSION_STALE_TIME_MS = 60_000;
const SERVER_ERROR_STATUS = 500;

export type SessionState =
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'unauthenticated' };

export const sessionQuery = queryOptions({
  queryKey: SESSION_QUERY_KEY,
  queryFn: ({ signal }) => fetchSession(signal),
  staleTime: SESSION_STALE_TIME_MS,
  refetchOnWindowFocus: true,
  retry: (failureCount, error) => failureCount < 1 && isRetryable(error),
});

export async function login(
  client: QueryClient,
  input: LoginRequest,
): Promise<PublicUser> {
  const { user } = await apiFetch<LoginResponse>(LOGIN_PATH, {
    method: 'POST',
    body: input,
  });

  establishSession(client, user);

  return user;
}

export async function register(
  client: QueryClient,
  input: RegisterRequest,
): Promise<PublicUser> {
  const { user } = await apiFetch<RegisterResponse>(REGISTER_PATH, {
    method: 'POST',
    body: input,
  });

  establishSession(client, user);

  return user;
}

export async function logout(client: QueryClient): Promise<void> {
  await apiFetch<void>(LOGOUT_PATH, { method: 'POST' });

  clearSession(client);
}

export function createUnauthorizedHandler(
  client: QueryClient,
): (error: unknown) => void {
  return (error) => {
    if (isUnauthorized(error) && sessionIsGone(error)) {
      clearSession(client);
    }
  };
}

async function fetchSession(signal: AbortSignal): Promise<SessionState> {
  assertBrowser();

  try {
    const { user } = await apiFetch<SessionResponse>(SESSION_PATH, {
      authRecovery: true,
      signal,
    });

    return { status: 'authenticated', user };
  } catch (error) {
    if (isUnauthorized(error) && recoveryProvedNoAccess(error)) {
      return { status: 'unauthenticated' };
    }

    throw error;
  }
}

function establishSession(client: QueryClient, user: PublicUser): void {
  client.clear();
  setSessionState(client, { status: 'authenticated', user });
}

function clearSession(client: QueryClient): void {
  client.clear();
  setSessionState(client, { status: 'unauthenticated' });
}

function setSessionState(client: QueryClient, state: SessionState): void {
  client.setQueryData(sessionQuery.queryKey, state);
}

function sessionIsGone(error: ApiError): boolean {
  return error.recoveryOutcome === 'unauthenticated';
}

function recoveryProvedNoAccess(error: ApiError): boolean {
  return (
    sessionIsGone(error) ||
    error.recoveryOutcome === 'refreshed' ||
    error.recoveryOutcome === 'already-valid'
  );
}

function isRetryable(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    (isApiError(error) && error.status >= SERVER_ERROR_STATUS)
  );
}

function assertBrowser(): void {
  if (typeof window === 'undefined') {
    throw new Error('The session can only be resolved in the browser.');
  }
}
