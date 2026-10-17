import { API_BASE_URL } from '~/lib/config';

const RELATIVE_PATH_MESSAGE =
  'API paths must be relative to the API origin and start with a single "/", for example "/health".';

export function resolveUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(RELATIVE_PATH_MESSAGE);
  }

  const url = new URL(path, API_BASE_URL);

  if (url.origin !== API_BASE_URL) {
    throw new Error(RELATIVE_PATH_MESSAGE);
  }

  return url.toString();
}
