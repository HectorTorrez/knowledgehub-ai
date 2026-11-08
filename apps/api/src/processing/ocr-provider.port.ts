export const OCR_PROVIDER = Symbol('OCR_PROVIDER');

export interface OcrProvider {
  recognize(
    pages: { pageNumber: number; image: Buffer }[],
  ): Promise<{ pageNumber: number; text: string }[]>;
}
