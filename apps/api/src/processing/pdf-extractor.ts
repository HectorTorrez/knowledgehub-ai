export const PDF_EXTRACTOR = Symbol('PDF_EXTRACTOR');

export interface PdfPage {
  pageNumber: number;
  content: string;
}

export interface PdfExtractionResult {
  pages: PdfPage[];
  pageCount: number;
}

export interface PdfExtractor {
  extractPdf(bytes: Uint8Array): Promise<PdfExtractionResult>;
}

export class PdfExtractionUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfExtractionUnavailableError';
  }
}
