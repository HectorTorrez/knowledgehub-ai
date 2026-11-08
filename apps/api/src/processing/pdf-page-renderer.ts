import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfPageRenderer } from './pdf-page-renderer.port.js';

export class PdfJsPageRenderer implements PdfPageRenderer {
  async render(pdf: Buffer, maxPages: number) {
    const loading = getDocument({ data: new Uint8Array(pdf) });
    const document = await loading.promise;
    try {
      const pages: { pageNumber: number; image: Buffer }[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= Math.min(document.numPages, maxPages);
        pageNumber++
      ) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          viewport,
        }).promise;
        pages.push({ pageNumber, image: canvas.toBuffer('image/png') });
        page.cleanup();
      }
      return pages;
    } finally {
      await loading.destroy();
    }
  }
}
