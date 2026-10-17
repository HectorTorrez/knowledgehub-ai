export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'X-CSRF-Token';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

export function readCsrfToken(cookieSource?: string): string | undefined {
  const source = cookieSource ?? readDocumentCookie();

  if (source === undefined || source.length === 0) {
    return undefined;
  }

  for (const part of source.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    if (name !== CSRF_COOKIE) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? decodeCookieValue(value) : undefined;
  }

  return undefined;
}

export function buildCsrfHeaders(
  method: string,
  cookieSource?: string,
): Record<string, string> {
  if (!isUnsafeMethod(method)) {
    return {};
  }

  const token = readCsrfToken(cookieSource);

  return token === undefined ? {} : { [CSRF_HEADER]: token };
}

function readDocumentCookie(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.cookie;
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
