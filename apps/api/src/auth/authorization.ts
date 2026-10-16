
const BEARER_PREFIX = 'Bearer ';

export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  const token = header.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : undefined;
}
