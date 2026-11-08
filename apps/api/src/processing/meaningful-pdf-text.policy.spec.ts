import { describe, expect, it } from 'vitest';
import { hasMeaningfulPdfText } from './meaningful-pdf-text.policy.js';

describe('hasMeaningfulPdfText', () => {
  it('rejects empty pages and incidental text', () => {
    expect(hasMeaningfulPdfText([])).toBe(false);
    expect(hasMeaningfulPdfText([{ pageNumber: 1, content: '  1 \n' }])).toBe(
      false,
    );
  });

  it('measures non-whitespace characters across pages', () => {
    expect(
      hasMeaningfulPdfText([
        { pageNumber: 1, content: '12345 67890' },
        { pageNumber: 2, content: 'abcdefghij' },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulPdfText([
        { pageNumber: 1, content: '1234567890' },
        { pageNumber: 2, content: ' ' },
      ]),
    ).toBe(false);
  });
});
