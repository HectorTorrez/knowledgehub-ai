import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './authorization.js';

describe('extractBearerToken', () => {
  it('returns the credential for a well-formed bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('rejects a missing header', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('rejects non-bearer schemes', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
    expect(extractBearerToken('bearer abc')).toBeUndefined();
    expect(extractBearerToken('Token abc')).toBeUndefined();
  });

  it('rejects a bare or empty bearer credential', () => {
    expect(extractBearerToken('Bearer')).toBeUndefined();
    expect(extractBearerToken('Bearer ')).toBeUndefined();
    expect(extractBearerToken('')).toBeUndefined();
  });
});
