import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AuthConfig, parseDurationToMs } from './auth.config.js';

describe('parseDurationToMs', () => {
  it('parses supported units', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('1h')).toBe(3_600_000);
    expect(parseDurationToMs('7d')).toBe(604_800_000);
  });

  it('rejects malformed durations', () => {
    expect(() => parseDurationToMs('15x')).toThrow();
    expect(() => parseDurationToMs('')).toThrow();
    expect(() => parseDurationToMs('m15')).toThrow();
  });
});

describe('AuthConfig', () => {
  function build(values: Record<string, unknown>) {
    const config = {
      getOrThrow: (key: string) => {
        if (key in values) return values[key];
        throw new Error(`missing ${key}`);
      },
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    return new AuthConfig(config);
  }

  it('exposes ttl values in milliseconds', () => {
    const authConfig = build({
      JWT_ACCESS_TTL: '15m',
      REFRESH_TOKEN_TTL_DAYS: 7,
    });

    expect(authConfig.accessTtlMs).toBe(900_000);
    expect(authConfig.refreshTtlMs).toBe(604_800_000);
    expect(authConfig.sessionTtlMs).toBe(authConfig.refreshTtlMs);
  });

  it('derives the cookie policy from configuration', () => {
    const authConfig = build({
      NODE_ENV: 'production',
      COOKIE_SAMESITE: 'strict',
    });

    expect(authConfig.cookiePolicy).toMatchObject({
      secure: true,
      sameSite: 'strict',
    });
  });

  it('defaults the browser-auth gate to off', () => {
    expect(build({}).browserAuthEnabled).toBe(false);
  });

  it('exposes the browser-auth gate and the CSRF secret', () => {
    const secret = 'c'.repeat(32);
    const authConfig = build({
      BROWSER_AUTH_ENABLED: 'true',
      CSRF_SECRET: secret,
    });

    expect(authConfig.browserAuthEnabled).toBe(true);
    expect(authConfig.csrfSecret).toBe(secret);
  });

  it('derives trusted origins from the CORS allow-list', () => {
    const authConfig = build({
      CORS_ORIGIN: 'http://localhost:3000, https://app.example.com',
    });

    expect(authConfig.trustedOrigins).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });
});
