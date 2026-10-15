import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { CookiePolicy } from './cookies.js';

/**
 * Signed double-submit CSRF primitives.
 *
 * The token is a random nonce plus an HMAC-SHA256 signature over that nonce.
 * The signed token is stored in a JavaScript-readable cookie so the SPA can echo
 * it back in the {@link CSRF_HEADER} request header. The signature stops an
 * attacker from fabricating a cookie value (cookie tossing / subdomain
 * injection); the double-submit equality check binds the request to a value the
 * browser only hands to same-origin JavaScript.
 *
 * These helpers are deliberately pure (no Nest, no request state) so generation,
 * verification and cookie options can be tested in isolation. Request-level
 * enforcement lives in `csrf.guard.ts`.
 */

/** Name of the JavaScript-readable CSRF cookie. */
export const CSRF_COOKIE = 'csrf_token';
/** Request header the frontend must echo the CSRF cookie value in. */
export const CSRF_HEADER = 'x-csrf-token';
/** CSRF cookie path. Broad, since every state-changing route needs it. */
export const CSRF_COOKIE_PATH = '/';

const TOKEN_BYTES = 32;
const SIGNATURE_BYTES = 32;
const TOKEN_PARTS = 2;

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True for methods that change state and therefore require CSRF protection. */
export function isUnsafeMethod(method: string | undefined): boolean {
  return typeof method === 'string' && UNSAFE_METHODS.has(method.toUpperCase());
}

function sign(secret: string, nonce: Buffer): Buffer {
  return createHmac('sha256', secret).update(nonce).digest();
}

/**
 * Generates a fresh signed CSRF token: `nonce.signature`, both base64url.
 * Requires the dedicated CSRF secret, never the access-token secret.
 */
export function generateCsrfToken(secret: string): string {
  const nonce = randomBytes(TOKEN_BYTES);
  const signature = sign(secret, nonce);

  return `${nonce.toString('base64url')}.${signature.toString('base64url')}`;
}

/**
 * Verifies a signed CSRF token's shape and signature using a timing-safe
 * comparison. Returns `false` (never throws) for any malformed input.
 */
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

/** Timing-safe equality of the cookie token and the header token. */
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

/**
 * Options for the CSRF cookie. Unlike the auth cookies it is NOT HttpOnly,
 * because the frontend has to read it to populate the request header.
 */
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

function firstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' && first.length > 0 ? first : undefined;
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Parses an absolute URL's origin, returning `undefined` when unparseable. */
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

/**
 * Resolves the request origin, preferring the `Origin` header and falling back
 * to the origin parsed from `Referer`. Returns `undefined` when neither is a
 * usable value.
 */
export function resolveRequestOrigin(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin) {
    return origin;
  }

  return originFromUrl(firstHeaderValue(request.headers.referer));
}

/** True when the origin is present and explicitly allowed. */
export function isTrustedOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  return origin !== undefined && trustedOrigins.includes(origin);
}
