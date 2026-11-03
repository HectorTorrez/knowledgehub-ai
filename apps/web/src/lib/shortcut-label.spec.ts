import { describe, expect, it } from 'vitest';
import { shortcutLabel } from './shortcut-label';

describe('shortcutLabel', () => {
  it('uses the platform modifier', () => {
    expect(shortcutLabel('MacIntel')).toBe('⌘K');
    expect(shortcutLabel('Win32')).toBe('Ctrl K');
    expect(shortcutLabel('Linux')).toBe('Ctrl K');
  });
});
