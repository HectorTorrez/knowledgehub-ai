import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { CookiePolicy } from './cookies.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_COOKIE_PATH = '/';

const TOKEN_BYTES = 32;
const SIGNATURE_BYTES = 32;
const TOKEN_PARTS = 2;

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isUnsafeMethod(method: string | undefined): boolean {
  return typeof method === 'string' && UNSAFE_METHODS.has(method.toUpperCase());
}

function sign(secret: string, nonce: Buffer): Buffer {
  return createHmac('sha256', secret).update(nonce).digest();
}

export function generateCsrfToken(secret: string): string {
  const nonce = randomBytes(TOKEN_BYTES);
  const signature = sign(secret, nonce);

  return `${nonce.toString('base64url')}.${signature.toString('base64url')}`;
}

export function verifyCsrfToken(secret: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== TOKEN_PARTS) {
    return false;
  }

  const nonce = Buffer.from(parts[0], 'base64url');
  const signature = Buffer.from(parts[1], 'base64url');

  if (nonce.length !== TOKEN_BYTES || signature.length !== SIGNATURE_BYTES) {
    return false;
  }

  return timingSafeEqual(sign(secret, nonce), signature);
}

export function csrfTokensMatch(
  cookieToken: unknown,
  headerToken: unknown,
): boolean {
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    return false;
  }

  const expected = Buffer.from(cookieToken);
  const actual = Buffer.from(headerToken);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export function buildCsrfCookieOptions(
  policy: CookiePolicy,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: false,
    secure: policy.secure,
    sameSite: policy.sameSite,
    domain: policy.domain,
    path: CSRF_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function buildClearCsrfCookieOptions(
  policy: CookiePolicy,
): CookieOptions {
  return {
    httpOnly: false,
    secure: policy.secure,
    sameSite: policy.sameSite,
    domain: policy.domain,
    path: CSRF_COOKIE_PATH,
  };
}

function firstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' && first.length > 0 ? first : undefined;
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function originFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function resolveRequestOrigin(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin) {
    return origin;
  }

  return originFromUrl(firstHeaderValue(request.headers.referer));
}

export function isTrustedOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  return origin !== undefined && trustedOrigins.includes(origin);
}
