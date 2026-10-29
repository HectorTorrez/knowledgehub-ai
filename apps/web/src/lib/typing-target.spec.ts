import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './typing-target';

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('recognizes %s', (tagName) => {
    expect(isTypingTarget(Object.assign(new EventTarget(), { tagName }))).toBe(true);
  });

  it('recognizes content editable elements', () => {
    const target = Object.assign(new EventTarget(), {
      tagName: 'DIV',
      isContentEditable: true,
    });
    expect(isTypingTarget(target)).toBe(true);
  });

  it('rejects other targets and null', () => {
    expect(isTypingTarget(new EventTarget())).toBe(false);
    expect(isTypingTarget(Object.assign(new EventTarget(), { tagName: 'DIV' }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
