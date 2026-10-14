/**
 * Default origin allowed during local development.
 * Matches `apps/api/.env.example`.
 */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

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
