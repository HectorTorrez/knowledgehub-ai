import { describe, expect, it } from 'vitest';
import { clearAskDraft, readAskDraft, writeAskDraft } from './ask-draft';

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('ask drafts', () => {
  it('returns an empty draft without a browser', () => {
    expect(readAskDraft('org-1', 'conversation-1')).toBe('');
  });

  it('scopes drafts by organization and conversation', () => {
    const storage = memoryStorage();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: storage },
      configurable: true,
    });

    try {
      writeAskDraft('org-1', 'conversation-1', 'draft one');
      writeAskDraft('org-1', undefined, 'new draft');
      writeAskDraft('org-2', 'conversation-1', 'other org');

      expect(readAskDraft('org-1', 'conversation-1')).toBe('draft one');
      expect(readAskDraft('org-1')).toBe('new draft');
      expect(readAskDraft('org-2', 'conversation-1')).toBe('other org');

      clearAskDraft('org-1', 'conversation-1');
      expect(readAskDraft('org-1', 'conversation-1')).toBe('');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});
