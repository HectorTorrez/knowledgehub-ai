import { describe, expect, it } from 'vitest';
import { createMinimalPdf } from '../../test/support/minimal-pdf.js';
import {
  DocumentExtractionError,
  DocumentResourceLimitError,
  DocumentTextExtractor,
  UnsupportedDocumentTypeError,
} from './document-text-extractor.js';
import { InlinePdfExtractor } from './inline-pdf-extractor.js';
import type { PdfExtractor } from './pdf-extractor.js';
import {
  MAX_EXTRACTABLE_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
} from './processing-limits.policy.js';

const encoder = new TextEncoder();
const extractor = new DocumentTextExtractor(new InlinePdfExtractor());

describe('DocumentTextExtractor', () => {
  it('decodes plain text byte-for-byte as a single page', async () => {
    const bytes = encoder.encode('Hello\nplain text');

    await expect(
      extractor.extract({ contentType: 'text/plain', bytes }),
    ).resolves.toEqual({
      pages: [{ pageNumber: 1, content: 'Hello\nplain text' }],
      pageCount: 1,
      characterCount: 16,
    });
  });

  it('decodes Markdown as UTF-8 text', async () => {
    const bytes = encoder.encode('# Title\n\n- item');

    await expect(
      extractor.extract({ contentType: 'text/markdown', bytes }),
    ).resolves.toEqual({
      pages: [{ pageNumber: 1, content: '# Title\n\n- item' }],
      pageCount: 1,
      characterCount: 15,
    });
  });

  it('rejects text that is not valid UTF-8', async () => {
    const bytes = Uint8Array.of(0xff, 0xfe, 0xfd);

    await expect(
      extractor.extract({ contentType: 'text/plain', bytes }),
    ).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it('rejects a content type it cannot extract', async () => {
    await expect(
      extractor.extract({
        contentType: 'application/octet-stream',
        bytes: encoder.encode('data'),
      }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentTypeError);
  });

  it('extracts embedded text from a PDF into page-attributed output', async () => {
    const bytes = createMinimalPdf('Hello KnowledgeHub PDF');

    const extracted = await extractor.extract({
      contentType: 'application/pdf',
      bytes,
    });

    expect(extracted.pageCount).toBe(1);
    expect(extracted.pages).toHaveLength(1);
    expect(extracted.pages[0]?.pageNumber).toBe(1);
    expect(extracted.pages[0]?.content).toContain('Hello KnowledgeHub PDF');
    expect(extracted.characterCount).toBe(
      extracted.pages.reduce((total, page) => total + page.content.length, 0),
    );
  });

  it('rejects a PDF that cannot be parsed', async () => {
    const bytes = encoder.encode('%PDF-1.4 not really a pdf');

    await expect(
      extractor.extract({ contentType: 'application/pdf', bytes }),
    ).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it('rejects a document above the extraction size limit before parsing', async () => {
    const bytes = new Uint8Array(MAX_EXTRACTABLE_BYTES + 1);

    await expect(
      extractor.extract({ contentType: 'application/pdf', bytes }),
    ).rejects.toBeInstanceOf(DocumentResourceLimitError);
  });

  it('rejects text above the extracted character limit', async () => {
    const bytes = encoder.encode('a'.repeat(MAX_EXTRACTED_CHARACTERS + 1));

    await expect(
      extractor.extract({ contentType: 'text/plain', bytes }),
    ).rejects.toBeInstanceOf(DocumentResourceLimitError);
  });

  it('delegates PDF extraction to the injected extractor', async () => {
    const pdfExtractor: PdfExtractor = {
      extractPdf: async () => ({
        pages: [{ pageNumber: 1, content: 'delegated' }],
        pageCount: 1,
      }),
    };
    const delegated = new DocumentTextExtractor(pdfExtractor);

    await expect(
      delegated.extract({
        contentType: 'application/pdf',
        bytes: encoder.encode('%PDF-'),
      }),
    ).resolves.toEqual({
      pages: [{ pageNumber: 1, content: 'delegated' }],
      pageCount: 1,
      characterCount: 'delegated'.length,
    });
  });

  it('rejects a PDF whose extracted page count exceeds the limit', async () => {
    const pdfExtractor: PdfExtractor = {
      extractPdf: async () => ({
        pages: [],
        pageCount: MAX_PDF_PAGES + 1,
      }),
    };
    const delegated = new DocumentTextExtractor(pdfExtractor);

    await expect(
      delegated.extract({
        contentType: 'application/pdf',
        bytes: encoder.encode('%PDF-'),
      }),
    ).rejects.toBeInstanceOf(DocumentResourceLimitError);
  });
});
