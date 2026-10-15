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
});
