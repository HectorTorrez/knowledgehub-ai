import { describe, expect, it } from 'vitest';
import {
  ApiError,
  fallbackMessage,
  isApiError,
  isConflict,
  isForbidden,
  isNetworkError,
  isNotFound,
  isRateLimited,
  isServiceUnavailable,
  isUnauthorized,
  NETWORK_ERROR_STATUS,
  parseRetryAfterSeconds,
  toApiError,
} from './errors';

describe('ApiError', () => {
  it('carries status, message, and validation errors', () => {
    const error = new ApiError({
      status: 400,
      message: 'bad request',
      validationErrors: ['a'],
    });

    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(400);
    expect(error.message).toBe('bad request');
    expect(error.validationErrors).toEqual(['a']);
  });

  it('defaults validation errors to an empty array', () => {
    expect(
      new ApiError({ status: 500, message: 'boom' }).validationErrors,
    ).toEqual([]);
  });

  it('preserves the cause', () => {
    const cause = new Error('root cause');
    expect(new ApiError({ status: 0, message: 'x', cause }).cause).toBe(cause);
  });
});

describe('toApiError', () => {
  it('reads a string message', () => {
    const error = toApiError(403, {
      statusCode: 403,
      message: 'You are not a member of this organization',
      error: 'Forbidden',
    });

    expect(error.status).toBe(403);
    expect(error.message).toBe('You are not a member of this organization');
    expect(error.validationErrors).toEqual([]);
  });

  it('reads an array message as validation errors', () => {
    const error = toApiError(400, {
      statusCode: 400,
      message: ['name: required', 'email: required'],
      error: 'Bad Request',
    });

    expect(error.message).toBe('name: required; email: required');
    expect(error.validationErrors).toEqual([
      'name: required',
      'email: required',
    ]);
  });

  it('falls back when the body is not an error envelope', () => {
    expect(toApiError(502, undefined).message).toBe(fallbackMessage(502));
    expect(toApiError(502, 'gateway error').message).toBe(fallbackMessage(502));
    expect(toApiError(502, {}).message).toBe(fallbackMessage(502));
    expect(toApiError(502, { message: '' }).message).toBe(fallbackMessage(502));
  });
});

describe('status helpers', () => {
  it('identifies an ApiError', () => {
    expect(isApiError(new ApiError({ status: 401, message: 'x' }))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError('x')).toBe(false);
  });

  it('matches by status code', () => {
    expect(isUnauthorized(new ApiError({ status: 401, message: 'x' }))).toBe(
      true,
    );
    expect(isForbidden(new ApiError({ status: 403, message: 'x' }))).toBe(true);
    expect(isNotFound(new ApiError({ status: 404, message: 'x' }))).toBe(true);
    expect(isConflict(new ApiError({ status: 409, message: 'x' }))).toBe(true);
    expect(
      isServiceUnavailable(new ApiError({ status: 503, message: 'x' })),
    ).toBe(true);
    expect(
      isNetworkError(
        new ApiError({ status: NETWORK_ERROR_STATUS, message: 'x' }),
      ),
    ).toBe(true);
  });

  it('does not match a plain error', () => {
    expect(isUnauthorized(new Error('x'))).toBe(false);
    expect(isForbidden(new Error('x'))).toBe(false);
  });
});

describe('rate limiting', () => {
  it('identifies a 429 response', () => {
    expect(isRateLimited(new ApiError({ status: 429, message: 'slow down' }))).toBe(
      true,
    );
    expect(isRateLimited(new ApiError({ status: 500, message: 'boom' }))).toBe(
      false,
    );
    expect(isRateLimited(new Error('x'))).toBe(false);
  });

  it('carries the retry delay on the error', () => {
    const error = toApiError(
      429,
      { statusCode: 429, message: 'Too many requests' },
      undefined,
      30,
    );

    expect(error.retryAfterSeconds).toBe(30);
  });

  it('parses a delta-seconds Retry-After header', () => {
    expect(parseRetryAfterSeconds('30')).toBe(30);
    expect(parseRetryAfterSeconds('0')).toBe(0);
    expect(parseRetryAfterSeconds('1.2')).toBe(2);
  });

  it('parses an HTTP-date Retry-After header', () => {
    const date = new Date(Date.now() + 45_000).toUTCString();

    expect(parseRetryAfterSeconds(date)).toBeGreaterThanOrEqual(44);
    expect(parseRetryAfterSeconds(date)).toBeLessThanOrEqual(46);
  });

  it('ignores a missing or malformed header', () => {
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
    expect(parseRetryAfterSeconds('')).toBeUndefined();
    expect(parseRetryAfterSeconds('soon')).toBeUndefined();
    expect(parseRetryAfterSeconds('-5')).toBeUndefined();
  });
});
