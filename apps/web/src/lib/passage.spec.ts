import { describe, expect, it } from 'vitest';
import { findPassage, overlapsPassage } from './passage';

describe('findPassage', () => {
  it('matches case, whitespace and line-break hyphenation', () => {
    const text = 'A multi-\n  line   Passage ends.';
    const match = findPassage(text, 'MULTILINE passage');
    expect(match && text.slice(match.start, match.end)).toBe('multi-\n  line   Passage');
  });
  it('finds the longest matching word span', () => {
    const text = 'The agreement expires on the last day of June.';
    const match = findPassage(text, 'Changed agreement expires on the last day of June elsewhere');
    expect(match && text.slice(match.start, match.end)).toBe('agreement expires on the last day of June');
  });
  it('does not highlight unrelated text', () => {
    expect(findPassage('A different sentence', 'nothing in common here')).toBeUndefined();
  });
});

describe('overlapsPassage', () => {
  it('detects spans that intersect the passage', () => {
    const range = { start: 10, end: 20 };
    expect(overlapsPassage(range, 5, 11)).toBe(true);
    expect(overlapsPassage(range, 19, 30)).toBe(true);
    expect(overlapsPassage(range, 0, 10)).toBe(false);
    expect(overlapsPassage(range, 20, 25)).toBe(false);
  });
});
