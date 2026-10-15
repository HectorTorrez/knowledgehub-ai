import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('applies safe defaults when optional values are absent', () => {
    const env = validateEnv({ ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.COOKIE_SAMESITE).toBe('lax');
    expect(env.COOKIE_SECURE).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({
      ...validEnv,
      PORT: '4321',
      REFRESH_TOKEN_TTL_DAYS: '7',
    });

    expect(env.PORT).toBe(4321);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _drop, ...withoutDatabase } = validEnv;
    expect(() => validateEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it('rejects a missing JWT_ACCESS_SECRET', () => {
    const { JWT_ACCESS_SECRET: _drop, ...withoutSecret } = validEnv;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT_ACCESS_SECRET shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a malformed JWT_ACCESS_TTL', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_TTL: '15x' }),
    ).toThrow(/JWT_ACCESS_TTL/);
  });

  it('rejects an invalid refresh-token lifetime', () => {
    expect(() =>
      validateEnv({ ...validEnv, REFRESH_TOKEN_TTL_DAYS: '0' }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
    expect(() =>
      validateEnv({ ...validEnv, REFRESH_TOKEN_TTL_DAYS: 'forever' }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
  });

  it('rejects an unsupported SameSite value', () => {
    expect(() =>
      validateEnv({ ...validEnv, COOKIE_SAMESITE: 'weird' }),
    ).toThrow(/COOKIE_SAMESITE/);
  });

  it('accepts an explicit cookie security override', () => {
    const env = validateEnv({ ...validEnv, COOKIE_SECURE: 'true' });
    expect(env.COOKIE_SECURE).toBe('true');
  });
});
