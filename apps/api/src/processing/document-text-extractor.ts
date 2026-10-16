import { Injectable } from '@nestjs/common';

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

@Injectable()
export class DocumentTextExtractor {
  async extract({
    contentType,
    bytes,
  }: ExtractionInput): Promise<ExtractedText> {
    const content =
      contentType === 'application/pdf'
        ? await this.extractPdf(bytes)
        : this.extractPlainText(contentType, bytes);

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
      const { text } = await extractText(bytes, { mergePages: true });
      return text;
    } catch (error) {
      throw new DocumentExtractionError('The PDF could not be parsed', {
        cause: error,
      });
    }
  }
}
