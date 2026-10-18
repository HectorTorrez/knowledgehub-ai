import { describe, expect, it, vi } from 'vitest';
import { DocumentExtractionError } from './document-text-extractor.js';
import { InlinePdfExtractor } from './inline-pdf-extractor.js';

vi.mock('unpdf', () => ({
  extractText: vi.fn(),
}));

import { extractText } from 'unpdf';

const extractor = new InlinePdfExtractor();

describe('InlinePdfExtractor', () => {
  it('maps extracted pages to page-attributed output', async () => {
    vi.mocked(extractText).mockResolvedValue({
      text: ['page one', 'page two'],
      totalPages: 2,
    });

    await expect(
      extractor.extractPdf(new Uint8Array([1, 2])),
    ).resolves.toEqual({
      pages: [
        { pageNumber: 1, content: 'page one' },
        { pageNumber: 2, content: 'page two' },
      ],
      pageCount: 2,
    });
  });

  it('treats a single text result as one page', async () => {
    vi.mocked(extractText).mockResolvedValue({
      text: 'single page',
      totalPages: 1,
    });

    await expect(
      extractor.extractPdf(new Uint8Array([1])),
    ).resolves.toEqual({
      pages: [{ pageNumber: 1, content: 'single page' }],
      pageCount: 1,
    });
  });

  it('wraps a parse failure as a document extraction error', async () => {
    vi.mocked(extractText).mockRejectedValue(new Error('boom'));

    await expect(
      extractor.extractPdf(new Uint8Array([1])),
    ).rejects.toBeInstanceOf(DocumentExtractionError);
  });
});
