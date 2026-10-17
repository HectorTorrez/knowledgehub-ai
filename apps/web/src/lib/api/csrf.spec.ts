import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCsrfHeaders,
  CSRF_COOKIE,
  CSRF_HEADER,
  isUnsafeMethod,
  readCsrfToken,
} from './csrf';

describe('isUnsafeMethod', () => {
  it('treats write methods as unsafe', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isUnsafeMethod(method)).toBe(true);
    }
  });

  it('treats read methods as safe', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isUnsafeMethod(method)).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(isUnsafeMethod('post')).toBe(true);
    expect(isUnsafeMethod('get')).toBe(false);
  });
});

describe('readCsrfToken', () => {
  it('reads the token from a cookie string', () => {
    expect(readCsrfToken(`${CSRF_COOKIE}=token-1`)).toBe('token-1');
    expect(readCsrfToken(`a=1; ${CSRF_COOKIE}=token-2; b=2`)).toBe('token-2');
  });

  it('returns undefined when the cookie is absent or empty', () => {
    expect(readCsrfToken('')).toBeUndefined();
    expect(readCsrfToken('other=1')).toBeUndefined();
    expect(readCsrfToken(`${CSRF_COOKIE}=`)).toBeUndefined();
    expect(readCsrfToken('malformed')).toBeUndefined();
  });

  it('decodes an encoded cookie value', () => {
    expect(readCsrfToken(`${CSRF_COOKIE}=a%2Eb`)).toBe('a.b');
  });

  it('reads document.cookie when no source is given', () => {
    vi.stubGlobal('document', { cookie: `${CSRF_COOKIE}=from-document` });
    expect(readCsrfToken()).toBe('from-document');
  });

  it('returns undefined when there is no document', () => {
    expect(readCsrfToken()).toBeUndefined();
  });
});

describe('buildCsrfHeaders', () => {
  it('attaches the token for unsafe methods', () => {
    expect(buildCsrfHeaders('POST', `${CSRF_COOKIE}=token-1`)).toEqual({
      [CSRF_HEADER]: 'token-1',
    });
  });

  it('omits the header for safe methods', () => {
    expect(buildCsrfHeaders('GET', `${CSRF_COOKIE}=token-1`)).toEqual({});
  });

  it('omits the header when the token is absent', () => {
    expect(buildCsrfHeaders('POST', '')).toEqual({});
    expect(buildCsrfHeaders('POST', 'other=1')).toEqual({});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
