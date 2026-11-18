export const NAVIGATION_SHORTCUTS = {
  h: '/organizations/$organizationId',
  d: '/organizations/$organizationId/documents',
  a: '/organizations/$organizationId/ask',
  s: '/organizations/$organizationId/search',
  i: '/organizations/$organizationId/insights',
  ',': '/organizations/$organizationId/settings',
} as const;

export type NavigationKey = keyof typeof NAVIGATION_SHORTCUTS;
export type NavigationTarget = (typeof NAVIGATION_SHORTCUTS)[NavigationKey];

export const CHORD_TIMEOUT_MS = 1200;

export function isNavigationKey(key: string): key is NavigationKey {
  return Object.hasOwn(NAVIGATION_SHORTCUTS, key);
}

export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export type ShortcutAction =
  | { type: 'help' }
  | { type: 'chord' }
  | { type: 'navigate'; to: NavigationTarget }
  | { type: 'none' };

export function resolveShortcut(
  event: ShortcutKeyEvent,
  chordStartedAt: number | null,
  now: number,
): ShortcutAction {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return { type: 'none' };
  }

  const key = event.key.toLowerCase();
  const chordActive =
    chordStartedAt !== null && now - chordStartedAt <= CHORD_TIMEOUT_MS;

  if (chordActive && isNavigationKey(key)) {
    return { type: 'navigate', to: NAVIGATION_SHORTCUTS[key] };
  }

  if (event.key === '?') {
    return { type: 'help' };
  }

  if (key === 'g') {
    return { type: 'chord' };
  }

  return { type: 'none' };
}
