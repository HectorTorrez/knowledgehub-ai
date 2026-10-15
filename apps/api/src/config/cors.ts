/**
 * Default origin allowed during local development.
 * Matches `apps/api/.env.example`.
 */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

/** Methods the API accepts. Explicit rather than reflected for clarity. */
export const CORS_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

/**
 * Request headers the browser is allowed to send. Includes the CSRF header the
 * double-submit flow relies on; without it, a browser would block the header on
 * a cross-origin request before it ever reached the API.
 */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-CSRF-Token',
];

/**
 * Builds the CORS options for the API. Credentials are enabled, so the origin
 * must be an explicit allow-list (never `*`).
 */
export function buildCorsOptions(origins: string[]) {
  return {
    origin: origins,
    credentials: true,
    methods: [...CORS_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  };
}

/**
 * Parses the `CORS_ORIGIN` value into an explicit allow-list.
 *
 * Credentials are enabled on the API, so a wildcard origin (`*`) is rejected:
 * browsers forbid `Access-Control-Allow-Origin: *` together with credentials.
 * Accepts a single origin or a comma-separated list.
 *
 * @throws Error when the configured value contains a wildcard origin.
 */
export function resolveCorsOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error(
      'Invalid CORS_ORIGIN: wildcard "*" is not allowed because credentials are enabled. ' +
        'Configure an explicit comma-separated list of allowed origins, e.g. "http://localhost:3000".',
    );
  }

  return origins;
}
