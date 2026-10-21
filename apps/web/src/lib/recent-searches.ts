const STORAGE_PREFIX = 'knowledgehub:recent-searches:';
const MAX_RECENT_SEARCHES = 5;

function storageKey(organizationId: string): string {
  return `${STORAGE_PREFIX}${organizationId}`;
}

export function readRecentSearches(organizationId: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function rememberSearch(
  organizationId: string,
  query: string,
): string[] {
  const trimmed = query.trim();
  const next =
    trimmed.length === 0
      ? readRecentSearches(organizationId)
      : [
          trimmed,
          ...readRecentSearches(organizationId).filter(
            (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
          ),
        ].slice(0, MAX_RECENT_SEARCHES);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        storageKey(organizationId),
        JSON.stringify(next),
      );
    } catch {
      return next;
    }
  }

  return next;
}

export function clearRecentSearches(organizationId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey(organizationId));
  } catch {
    return;
  }
}
