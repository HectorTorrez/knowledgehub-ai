import { Injectable } from '@nestjs/common';
import {
  MAX_EXTRACTABLE_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
} from './processing-limits.policy.js';

export interface ExtractionInput {
  contentType: string;
  bytes: Uint8Array;
}

export interface ExtractedText {
  content: string;
  characterCount: number;
}

const PLAIN_TEXT_CONTENT_TYPES = ['text/plain', 'text/markdown'] as const;

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
  async extract({
    contentType,
    bytes,
  }: ExtractionInput): Promise<ExtractedText> {
    if (bytes.byteLength > MAX_EXTRACTABLE_BYTES) {
      throw new DocumentResourceLimitError(
        'The document exceeds the extraction size limit',
      );
    }

    const content =
      contentType === 'application/pdf'
        ? await this.extractPdf(bytes)
        : this.extractPlainText(contentType, bytes);

    if (content.length > MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentResourceLimitError(
        'The extracted text exceeds the character limit',
      );
    }

    return { content, characterCount: content.length };
  }

  private extractPlainText(contentType: string, bytes: Uint8Array): string {
    if (!(PLAIN_TEXT_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new UnsupportedDocumentTypeError(contentType);
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      throw new DocumentExtractionError('The document is not valid UTF-8', {
        cause: error,
      });
    }
  }

  private async extractPdf(bytes: Uint8Array): Promise<string> {
    try {
      const { extractText } = await import('unpdf');
      const { text, totalPages } = await extractText(bytes, {
        mergePages: true,
      });

      if (totalPages > MAX_PDF_PAGES) {
        throw new DocumentResourceLimitError(
          'The PDF exceeds the page limit',
        );
      }

      return text;
    } catch (error) {
      if (error instanceof DocumentResourceLimitError) {
        throw error;
      }

      throw new DocumentExtractionError('The PDF could not be parsed', {
        cause: error,
      });
    }
  }
}
