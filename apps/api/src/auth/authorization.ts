/**
 * Authorization-header parsing shared by the CSRF and session guards.
 *
 * Both guards must agree on the authentication source: the CSRF guard skips
 * cookie CSRF rules only for requests the session guard will actually treat as
 * bearer-authenticated, and it enforces them for everything else. A single
 * helper keeps that decision from drifting.
 */

/** Case-sensitive scheme prefix used by RFC 6750 bearer credentials. */
const BEARER_PREFIX = 'Bearer ';

/**
 * Extracts a non-empty bearer credential from an `Authorization` header value.
 *
 * Returns `undefined` for a missing header, a non-bearer scheme, or the prefix
 * followed by no credential (`"Bearer "`). An empty credential is deliberately
 * *not* treated as bearer, so it cannot be used to skip CSRF while the session
 * guard silently falls back to cookie authentication.
 */
export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  const token = header.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : undefined;
}
