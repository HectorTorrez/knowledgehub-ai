import type { ApiErrorResponse } from '@knowledgehub/shared-types';
import type { RefreshOutcomeStatus } from '~/lib/auth/refresh';

export const NETWORK_ERROR_STATUS = 0;

export interface ApiErrorOptions {
  status: number;
  message: string;
  validationErrors?: string[];
  recoveryOutcome?: RefreshOutcomeStatus;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly validationErrors: string[];
  readonly recoveryOutcome?: RefreshOutcomeStatus;

  constructor({
    status,
    message,
    validationErrors = [],
    recoveryOutcome,
    cause,
  }: ApiErrorOptions) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.validationErrors = validationErrors;
    this.recoveryOutcome = recoveryOutcome;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isNetworkError(value: unknown): boolean {
  return isApiError(value) && value.status === NETWORK_ERROR_STATUS;
}

export function isUnauthorized(value: unknown): value is ApiError {
  return isApiError(value) && value.status === 401;
}

export function isForbidden(value: unknown): boolean {
  return isApiError(value) && value.status === 403;
}

export function isNotFound(value: unknown): boolean {
  return isApiError(value) && value.status === 404;
}

export function isConflict(value: unknown): boolean {
  return isApiError(value) && value.status === 409;
}

export function isServiceUnavailable(value: unknown): boolean {
  return isApiError(value) && value.status === 503;
}

export function fallbackMessage(status: number): string {
  return `Request failed with status ${status}.`;
}

export function toApiError(
  status: number,
  body: unknown,
  recoveryOutcome?: RefreshOutcomeStatus,
): ApiError {
  const { message, validationErrors } = readErrorMessage(status, body);

  return new ApiError({ status, message, validationErrors, recoveryOutcome });
}

function readErrorMessage(
  status: number,
  body: unknown,
): { message: string; validationErrors: string[] } {
  const response = body as ApiErrorResponse | null | undefined;
  const raw = response?.message;

  if (Array.isArray(raw)) {
    const validationErrors = raw.filter(
      (entry): entry is string => typeof entry === 'string',
    );

    if (validationErrors.length > 0) {
      return {
        message: validationErrors.join('; '),
        validationErrors,
      };
    }
  }

  if (typeof raw === 'string' && raw.length > 0) {
    return { message: raw, validationErrors: [] };
  }

  return { message: fallbackMessage(status), validationErrors: [] };
}
