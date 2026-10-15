import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveCorsOrigins } from '../config/cors.js';
import { resolveCookiePolicy, type CookiePolicy } from './cookies.js';

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;

/** Parses a duration such as `15m`, `1h` or `7d` into milliseconds. */
export function parseDurationToMs(value: string): number {
  const match = DURATION_PATTERN.exec(value);

  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Expected a value like 15s, 15m, 1h or 7d.`,
    );
  }

  const amount = Number(match[1]);
  const multiplier =
    match[2] === 's'
      ? MS_PER_SECOND
      : match[2] === 'm'
        ? MS_PER_MINUTE
        : match[2] === 'h'
          ? MS_PER_HOUR
          : MS_PER_DAY;

  return amount * multiplier;
}

/**
 * Typed, centralized access to the authentication-related environment values.
 * Values are already validated by {@link validateEnv} at startup.
 */
@Injectable()
export class AuthConfig {
  constructor(private readonly config: ConfigService) {}

  get accessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  get accessTtl(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_TTL');
  }

  get accessTtlMs(): number {
    return parseDurationToMs(this.accessTtl);
  }

  get refreshTtlMs(): number {
    return this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * MS_PER_DAY;
  }

  get sessionTtlMs(): number {
    return this.refreshTtlMs;
  }

  get cookiePolicy(): CookiePolicy {
    return resolveCookiePolicy({
      NODE_ENV: this.config.get<string>('NODE_ENV'),
      COOKIE_SECURE: this.config.get<string>('COOKIE_SECURE'),
      COOKIE_SAMESITE: this.config.get<string>('COOKIE_SAMESITE'),
      COOKIE_DOMAIN: this.config.get<string>('COOKIE_DOMAIN'),
    });
  }

  /**
   * Whether browser (cookie-based) authentication is enabled. Off by default;
   * startup validation guarantees a CSRF secret is present when this is true.
   */
  get browserAuthEnabled(): boolean {
    return this.config.get<string>('BROWSER_AUTH_ENABLED') === 'true';
  }

  /** Dedicated HMAC secret for signing CSRF tokens. */
  get csrfSecret(): string {
    return this.config.getOrThrow<string>('CSRF_SECRET');
  }

  /** Origins trusted for credential-bearing (cookie) requests. */
  get trustedOrigins(): string[] {
    return resolveCorsOrigins(this.config.get<string>('CORS_ORIGIN'));
  }
}
