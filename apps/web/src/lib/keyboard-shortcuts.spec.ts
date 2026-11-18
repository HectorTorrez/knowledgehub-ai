import { describe, expect, it } from 'vitest';
import { CHORD_TIMEOUT_MS, resolveShortcut } from './keyboard-shortcuts';

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...modifiers,
});

describe('resolveShortcut', () => {
  it('opens help with a question mark', () => {
    expect(resolveShortcut(press('?'), null, 0)).toEqual({ type: 'help' });
  });

  it('starts a chord with g and navigates with the next key', () => {
    expect(resolveShortcut(press('g'), null, 0)).toEqual({ type: 'chord' });
    expect(resolveShortcut(press('d'), 0, 500)).toEqual({
      type: 'navigate',
      to: '/organizations/$organizationId/documents',
    });
    expect(resolveShortcut(press(','), 0, 500)).toEqual({
      type: 'navigate',
      to: '/organizations/$organizationId/settings',
    });
  });

  it('ignores navigation keys outside a chord or after it expires', () => {
    expect(resolveShortcut(press('d'), null, 0)).toEqual({ type: 'none' });
    expect(resolveShortcut(press('d'), 0, CHORD_TIMEOUT_MS + 1)).toEqual({
      type: 'none',
    });
  });

  it('leaves modified keys to the browser and other handlers', () => {
    expect(resolveShortcut(press('g', { metaKey: true }), null, 0)).toEqual({
      type: 'none',
    });
    expect(resolveShortcut(press('d', { ctrlKey: true }), 0, 10)).toEqual({
      type: 'none',
    });
  });
});
