import { describe, expect, it } from 'vitest';
import { createMinimalPdf } from '../../test/support/minimal-pdf.js';
import {
  DocumentExtractionError,
  DocumentTextExtractor,
  UnsupportedDocumentTypeError,
} from './document-text-extractor.js';

const encoder = new TextEncoder();
const extractor = new DocumentTextExtractor();

describe('DocumentTextExtractor', () => {
  it('decodes plain text byte-for-byte', async () => {
    const bytes = encoder.encode('Hello\nplain text');

    await expect(
      extractor.extract({ contentType: 'text/plain', bytes }),
    ).resolves.toEqual({
      content: 'Hello\nplain text',
      characterCount: 16,
    });
  });

  it('decodes Markdown as UTF-8 text', async () => {
    const bytes = encoder.encode('# Title\n\n- item');

    await expect(
      extractor.extract({ contentType: 'text/markdown', bytes }),
    ).resolves.toEqual({
      content: '# Title\n\n- item',
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

  it('extracts embedded text from a PDF', async () => {
    const bytes = createMinimalPdf('Hello KnowledgeHub PDF');

    const extracted = await extractor.extract({
      contentType: 'application/pdf',
      bytes,
    });

    expect(extracted.content).toContain('Hello KnowledgeHub PDF');
    expect(extracted.characterCount).toBe(extracted.content.length);
  });

  it('rejects a PDF that cannot be parsed', async () => {
    const bytes = encoder.encode('%PDF-1.4 not really a pdf');

    await expect(
      extractor.extract({ contentType: 'application/pdf', bytes }),
    ).rejects.toBeInstanceOf(DocumentExtractionError);
  });
});
