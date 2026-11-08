export const PDF_PAGE_RENDERER = Symbol('PDF_PAGE_RENDERER');

export interface PdfPageRenderer {
  render(
    pdf: Buffer,
    maxPages: number,
  ): Promise<{ pageNumber: number; image: Buffer }[]>;
}
