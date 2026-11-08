import type { ExtractedPage } from './document-text-extractor.js';

const MIN_NON_WHITESPACE_CHARACTERS_PER_PAGE = 10;

export function hasMeaningfulPdfText(pages: ExtractedPage[]): boolean {
  if (pages.length === 0) return false;

  const characters = pages.reduce(
    (total, page) => total + page.content.replace(/\s/gu, '').length,
    0,
  );

  return characters >= pages.length * MIN_NON_WHITESPACE_CHARACTERS_PER_PAGE;
}
