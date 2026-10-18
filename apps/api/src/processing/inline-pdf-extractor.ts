import { Injectable } from '@nestjs/common';
import { DocumentExtractionError } from './document-text-extractor.js';
import type { PdfExtractionResult, PdfExtractor } from './pdf-extractor.js';

@Injectable()
export class InlinePdfExtractor implements PdfExtractor {
  async extractPdf(bytes: Uint8Array): Promise<PdfExtractionResult> {
    try {
      const { extractText } = await import('unpdf');
      const { text, totalPages } = await extractText(bytes, {
        mergePages: false,
      });

      const pageTexts = Array.isArray(text) ? text : [text];

      return {
        pages: pageTexts.map((content, index) => ({
          pageNumber: index + 1,
          content,
        })),
        pageCount: totalPages,
      };
    } catch (error) {
      throw new DocumentExtractionError('The PDF could not be parsed', {
        cause: error,
      });
    }
  }
}
