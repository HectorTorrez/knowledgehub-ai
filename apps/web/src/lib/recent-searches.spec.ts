import { describe, expect, it } from 'vitest';
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from './recent-searches';

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('recent searches', () => {
  it('returns an empty list without a browser', () => {
    expect(readRecentSearches('org-1')).toEqual([]);
  });

  it('deduplicates case-insensitively and caps the list', () => {
    const storage = memoryStorage();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: storage },
      configurable: true,
    });

    try {
      rememberSearch('org-1', 'Alpha');
      rememberSearch('org-1', 'beta');
      rememberSearch('org-1', 'ALPHA');

      expect(readRecentSearches('org-1')).toEqual(['ALPHA', 'beta']);

      for (const query of ['one', 'two', 'three', 'four', 'five']) {
        rememberSearch('org-1', query);
      }

      expect(readRecentSearches('org-1')).toHaveLength(5);
      expect(readRecentSearches('org-1')[0]).toBe('five');

      clearRecentSearches('org-1');
      expect(readRecentSearches('org-1')).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});
