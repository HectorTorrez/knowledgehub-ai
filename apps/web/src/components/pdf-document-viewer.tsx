import {
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type * as PdfJsModule from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { findPassage, overlapsPassage } from '~/lib/passage';
import 'pdfjs-dist/web/pdf_viewer.css';

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const FIT_WIDTH_PADDING = 32;
const MAX_FIT_SCALE = 1.5;
const HIGHLIGHT_CLASSES = ['rounded-sm', 'bg-yellow-300/60', 'dark:bg-yellow-400/40'];

type PdfJs = typeof PdfJsModule;

let pdfJsPromise: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfJs, worker]) => {
    pdfJs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfJs;
  });
  return pdfJsPromise;
}

function isRenderingCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function fitWidthScale(page: PDFPageProxy, containerWidth: number): number {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  return clampScale(
    Math.min(MAX_FIT_SCALE, (containerWidth - FIT_WIDTH_PADDING) / pageWidth),
  );
}

function useElementWidth(element: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width + FIT_WIDTH_PADDING);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

function highlightPassage(
  textDivs: HTMLElement[],
  items: string[],
  quote: string,
): HTMLElement | undefined {
  const match = findPassage(items.join(' '), quote);
  if (!match) return undefined;

  let offset = 0;
  let first: HTMLElement | undefined;
  items.forEach((item, index) => {
    const div = textDivs[index];
    if (div && overlapsPassage(match, offset, offset + item.length)) {
      div.classList.add(...HIGHLIGHT_CLASSES);
      div.dataset.highlight = 'true';
      first ??= div;
    }
    offset += item.length + 1;
  });
  return first;
}

export function PdfDocumentViewer({
  url,
  initialPage,
  quote,
  onError,
}: Readonly<{
  url: string;
  initialPage: number;
  quote?: string;
  onError: () => void;
}>) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [zoom, setZoom] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(viewport);

  useEffect(() => {
    let cancelled = false;
    const task = loadPdfJs().then((pdfJs) => pdfJs.getDocument({ url }));
    task
      .then((loading) => loading.promise)
      .then((document) => {
        if (cancelled) return;
        setPdf(document);
        setPageNumber((current) => Math.min(current, document.numPages));
      })
      .catch(() => {
        if (!cancelled) onError();
      });
    return () => {
      cancelled = true;
      void task.then((loading) => loading.destroy());
    };
  }, [url, onError]);

  useEffect(() => {
    if (!pdf || containerWidth === 0) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;

    const render = async (page: PDFPageProxy, pdfJs: PdfJs) => {
      const canvasElement = canvas.current;
      const layerElement = textLayer.current;
      if (!canvasElement || !layerElement) return;

      const pageScale = zoom ?? fitWidthScale(page, containerWidth);
      setScale(pageScale);
      const pageViewport = page.getViewport({ scale: pageScale });
      const outputScale = window.devicePixelRatio || 1;
      canvasElement.width = Math.floor(pageViewport.width * outputScale);
      canvasElement.height = Math.floor(pageViewport.height * outputScale);
      canvasElement.style.width = `${pageViewport.width}px`;
      canvasElement.style.height = `${pageViewport.height}px`;

      const renderTask = page.render({
        canvas: canvasElement,
        viewport: pageViewport,
        transform:
          outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      cancelRender = () => renderTask.cancel();
      await renderTask.promise;
      if (cancelled) return;

      layerElement.replaceChildren();
      layerElement.style.setProperty('--scale-factor', String(pageScale));
      layerElement.style.setProperty('--total-scale-factor', String(pageScale));
      const layer = new pdfJs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: layerElement,
        viewport: pageViewport,
      });
      cancelRender = () => layer.cancel();
      await layer.render();
      if (cancelled || !quote || page.pageNumber !== initialPage) return;

      highlightPassage(layer.textDivs, layer.textContentItemsStr, quote)
        ?.scrollIntoView({ block: 'center' });
    };

    Promise.all([pdf.getPage(pageNumber), loadPdfJs()])
      .then(([page, pdfJs]) => render(page, pdfJs))
      .catch((error: unknown) => {
        if (!cancelled && !isRenderingCancelled(error)) onError();
      });

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, pageNumber, zoom, containerWidth, quote, initialPage, onError]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={!pdf || pageNumber <= 1}
            onClick={() => setPageNumber((current) => current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-24 text-center text-sm tabular-nums text-muted-foreground">
            {pdf ? `Page ${pageNumber} of ${pdf.numPages}` : 'Loading…'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={!pdf || pageNumber >= pdf.numPages}
            onClick={() => setPageNumber((current) => current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            disabled={!pdf || scale <= MIN_SCALE}
            onClick={() => setZoom(clampScale(scale - SCALE_STEP))}
          >
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            disabled={!pdf || scale >= MAX_SCALE}
            onClick={() => setZoom(clampScale(scale + SCALE_STEP))}
          >
            <ZoomIn />
          </Button>
          <Button
            variant={zoom === null ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="Fit to width"
            aria-pressed={zoom === null}
            disabled={!pdf}
            onClick={() => setZoom(null)}
          >
            <MoveHorizontal />
          </Button>
        </div>
      </div>
      <div ref={viewport} className="max-h-[75vh] overflow-auto bg-muted/40 p-4">
        {pdf ? null : (
          <Skeleton className="mx-auto aspect-[1/1.3] w-full max-w-2xl" />
        )}
        <div className="relative mx-auto w-fit bg-white shadow-sm">
          <canvas ref={canvas} />
          <div ref={textLayer} className="textLayer" />
        </div>
      </div>
    </div>
  );
}
