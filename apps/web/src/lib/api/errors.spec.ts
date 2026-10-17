import { describe, expect, it } from 'vitest';
import {
  ApiError,
  fallbackMessage,
  isApiError,
  isConflict,
  isForbidden,
  isNetworkError,
  isNotFound,
  isServiceUnavailable,
  isUnauthorized,
  NETWORK_ERROR_STATUS,
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
