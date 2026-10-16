export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

export const CORS_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-CSRF-Token',
];

export function buildCorsOptions(origins: string[]) {
  return {
    origin: origins,
    credentials: true,
    methods: [...CORS_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  };
}

/**
 * Credentials are enabled on the API, so a wildcard origin (`*`) is rejected:
 * browsers forbid `Access-Control-Allow-Origin: *` together with credentials.
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
