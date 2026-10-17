const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

const MISSING_MESSAGE =
  'VITE_API_BASE_URL is required. Set it to the API origin, for example http://localhost:3001.';

export function resolveApiBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(MISSING_MESSAGE);
  }

  const value = raw.trim();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `VITE_API_BASE_URL must be an absolute URL, for example http://localhost:3001. Received "${value}".`,
    );
  }

  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error(
      `VITE_API_BASE_URL must use the http or https scheme. Received "${value}".`,
    );
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('VITE_API_BASE_URL must not contain credentials.');
  }

  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error(
      'VITE_API_BASE_URL must not contain a query string or fragment.',
    );
  }

  if (url.pathname.replace(/\/+$/, '').length > 0) {
    throw new Error(
      `VITE_API_BASE_URL must not contain a path beyond the origin. Received "${value}".`,
    );
  }

  return url.origin;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
