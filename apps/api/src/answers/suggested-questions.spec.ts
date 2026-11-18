import { describe, expect, it } from 'vitest';
import { sanitizeSuggestions } from './suggested-questions.js';

describe('sanitizeSuggestions', () => {
  it('trims, collapses whitespace, and drops duplicates ignoring case', () => {
    expect(
      sanitizeSuggestions(
        ['  What is   the notice period? ', 'what is the notice period?'],
        3,
      ),
    ).toEqual(['What is the notice period?']);
  });

  it('drops non-strings, too-short, and too-long entries', () => {
    expect(
      sanitizeSuggestions([42, 'Why?', 'x'.repeat(161), 'Who signs it?'], 3),
    ).toEqual(['Who signs it?']);
  });

  it('caps the number of questions', () => {
    expect(
      sanitizeSuggestions(
        ['First question?', 'Second question?', 'Third question?'],
        2,
      ),
    ).toEqual(['First question?', 'Second question?']);
  });

  it('returns nothing for a non-array payload', () => {
    expect(sanitizeSuggestions({ questions: [] }, 3)).toEqual([]);
  });
});
