import { Inject, Injectable } from '@nestjs/common';
import {
  DOCX_CONTENT_TYPE,
  PPTX_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from '../documents/upload-policy.js';
import { extractDocx } from './docx-extractor.js';
import { extractHtml } from './html-extractor.js';
import { extractPptx } from './pptx-extractor.js';
import { extractXlsx } from './xlsx-extractor.js';
import { PDF_EXTRACTOR, type PdfExtractor } from './pdf-extractor.js';
import {
  MAX_EXTRACTABLE_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
} from './processing-limits.policy.js';

export interface ExtractionInput {
  contentType: string;
  bytes: Uint8Array;
}

export interface ExtractedPage {
  pageNumber: number;
  content: string;
}

export interface ExtractedText {
  pages: ExtractedPage[];
  pageCount: number;
  characterCount: number;
}

const PLAIN_TEXT_CONTENT_TYPES = ['text/plain', 'text/markdown'] as const;
const HTML_CONTENT_TYPE = 'text/html';

export class UnsupportedDocumentTypeError extends Error {
  constructor(contentType: string) {
    super(`Content type "${contentType}" cannot be extracted`);
    this.name = 'UnsupportedDocumentTypeError';
  }
}

export class DocumentExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocumentExtractionError';
  }
}

export class DocumentResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentResourceLimitError';
  }
}

@Injectable()
export class DocumentTextExtractor {
  constructor(
    @Inject(PDF_EXTRACTOR) private readonly pdfExtractor: PdfExtractor,
  ) {}

  async extract({
    contentType,
    bytes,
  }: ExtractionInput): Promise<ExtractedText> {
    if (bytes.byteLength > MAX_EXTRACTABLE_BYTES) {
      throw new DocumentResourceLimitError(
        'The document exceeds the extraction size limit',
      );
    }

    const pages = await this.extractPages(contentType, bytes);

    const characterCount = pages.reduce(
      (total, page) => total + page.content.length,
      0,
    );

    if (characterCount > MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentResourceLimitError(
        'The extracted text exceeds the character limit',
      );
    }

    return { pages, pageCount: pages.length, characterCount };
  }

  private async extractPages(
    contentType: string,
    bytes: Uint8Array,
  ): Promise<ExtractedPage[]> {
    if (contentType === 'application/pdf') return this.extractPdf(bytes);
    if (contentType === DOCX_CONTENT_TYPE) {
      return [{ pageNumber: 1, content: await extractDocx(bytes) }];
    }
    if (contentType === PPTX_CONTENT_TYPE) return extractPptx(bytes);
    if (contentType === XLSX_CONTENT_TYPE) return extractXlsx(bytes);
    if (contentType === HTML_CONTENT_TYPE) {
      decodeUtf8(bytes);
      return [{ pageNumber: 1, content: await extractHtml(bytes) }];
    }
    return this.extractPlainTextPages(contentType, bytes);
  }

  private async extractPdf(bytes: Uint8Array): Promise<ExtractedPage[]> {
    const { pages, pageCount } = await this.pdfExtractor.extractPdf(bytes);

    if (pageCount > MAX_PDF_PAGES) {
      throw new DocumentResourceLimitError('The PDF exceeds the page limit');
    }

    return pages;
  }

  private extractPlainTextPages(
    contentType: string,
    bytes: Uint8Array,
  ): ExtractedPage[] {
    if (
      !(PLAIN_TEXT_CONTENT_TYPES as readonly string[]).includes(contentType)
    ) {
      throw new UnsupportedDocumentTypeError(contentType);
    }

    return [{ pageNumber: 1, content: decodeUtf8(bytes) }];
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DocumentExtractionError('The document is not valid UTF-8', {
      cause: error,
    });
  }
}
