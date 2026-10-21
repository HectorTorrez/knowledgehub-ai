const STORAGE_PREFIX = 'knowledgehub:ask-draft:';

function storageKey(organizationId: string, conversationId?: string): string {
  return `${STORAGE_PREFIX}${organizationId}:${conversationId ?? 'new'}`;
}

export function readAskDraft(
  organizationId: string,
  conversationId?: string,
): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return (
      window.localStorage.getItem(storageKey(organizationId, conversationId)) ??
      ''
    );
  } catch {
    return '';
  }
}

export function writeAskDraft(
  organizationId: string,
  conversationId: string | undefined,
  value: string,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = storageKey(organizationId, conversationId);

    if (value.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function clearAskDraft(
  organizationId: string,
  conversationId?: string,
): void {
  writeAskDraft(organizationId, conversationId, '');
}
