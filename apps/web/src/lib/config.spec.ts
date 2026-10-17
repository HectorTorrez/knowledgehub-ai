import { describe, expect, it } from 'vitest';
import { API_BASE_URL, resolveApiBaseUrl } from './config';

describe('resolveApiBaseUrl', () => {
  it('accepts an origin and strips a trailing slash', () => {
    expect(resolveApiBaseUrl('http://localhost:3001')).toBe(
      'http://localhost:3001',
    );
    expect(resolveApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
    expect(resolveApiBaseUrl('  https://api.example.com  ')).toBe(
      'https://api.example.com',
    );
  });

  it('preserves an explicit port', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080',
    );
  });

  it('rejects a missing or blank value', () => {
    expect(() => resolveApiBaseUrl(undefined)).toThrow(/required/);
    expect(() => resolveApiBaseUrl('')).toThrow(/required/);
    expect(() => resolveApiBaseUrl('   ')).toThrow(/required/);
    expect(() => resolveApiBaseUrl(42)).toThrow(/required/);
    expect(() => resolveApiBaseUrl(null)).toThrow(/required/);
  });

  it('rejects a value that is not an absolute URL', () => {
    expect(() => resolveApiBaseUrl('not a url')).toThrow(/absolute URL/);
    expect(() => resolveApiBaseUrl('://missing-scheme')).toThrow(
      /absolute URL/,
    );
  });

  it('rejects a non-http scheme', () => {
    expect(() => resolveApiBaseUrl('ftp://example.com')).toThrow(
      /http or https/,
    );
    expect(() => resolveApiBaseUrl('localhost:3001')).toThrow(
      /http or https/,
    );
  });

  it('rejects a path beyond the origin', () => {
    expect(() => resolveApiBaseUrl('http://localhost:3001/api')).toThrow(
      /path beyond the origin/,
    );
    expect(() => resolveApiBaseUrl('https://api.example.com/v1')).toThrow(
      /path beyond the origin/,
    );
  });

  it('rejects embedded credentials', () => {
    expect(() => resolveApiBaseUrl('http://user:secret@example.com')).toThrow(
      /credentials/,
    );
  });

  it('rejects a query string or fragment', () => {
    expect(() => resolveApiBaseUrl('http://example.com?a=1')).toThrow(
      /query string or fragment/,
    );
    expect(() => resolveApiBaseUrl('http://example.com#section')).toThrow(
      /query string or fragment/,
    );
  });
});

describe('API_BASE_URL', () => {
  it('is resolved from the environment', () => {
    expect(API_BASE_URL).toBe('http://localhost:3001');
  });
});
