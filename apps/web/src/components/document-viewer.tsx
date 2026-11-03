import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { findPassage } from '~/lib/passage';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function DocumentViewer({ url, contentType, page: initialPage, quote, retry }: Readonly<{ url: string; contentType: string | null; page?: number; quote?: string; retry: () => void }>) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [text, setText] = useState<string>();
  const [error, setError] = useState(false);
  const [page, setPage] = useState(initialPage ?? 1);
  const [scale, setScale] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const isPdf = contentType === 'application/pdf';
  const isText = contentType?.startsWith('text/') || contentType === 'application/markdown';

  useEffect(() => {
    let cancelled = false;
    setError(false); setPdf(undefined); setText(undefined);
    if (isPdf) {
      void import('pdfjs-dist').then(async (lib) => {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        return lib.getDocument({ url }).promise;
      }).then((doc) => { if (!cancelled) setPdf(doc);  }).catch(() => { if (!cancelled) setError(true); });
    } else if (isText) {
      void fetch(url).then((response) => { if (!response.ok) throw new Error('Fetch failed'); return response.text(); }).then((value) => { if (!cancelled) setText(value); }).catch(() => { if (!cancelled) setError(true); });
    }
    return () => { cancelled = true; };
  }, [url, isPdf, isText]);

  useEffect(() => {
    if (!pdf || !canvas.current || !layer.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | undefined;
    void (async () => {
      const lib = await import('pdfjs-dist');
      const pdfPage = await pdf.getPage(Math.min(page, pdf.numPages));
      if (cancelled || !canvas.current || !layer.current) return;
      const viewport = pdfPage.getViewport({ scale });
      const ctx = canvas.current.getContext('2d');
      if (!ctx) return;
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      layer.current.replaceChildren();
      layer.current.style.width = `${viewport.width}px`; layer.current.style.height = `${viewport.height}px`;
      renderTask = pdfPage.render({ canvas: canvas.current, canvasContext: ctx, viewport });
      await (renderTask as ReturnType<typeof pdfPage.render>).promise;
      const content = await pdfPage.getTextContent();
      if (cancelled || !layer.current) return;
      const items = content.items.filter((item) => 'str' in item);
      const full = items.map((item) => item.str).join(' ');
      const match = quote && page === (initialPage ?? 1) ? findPassage(full, quote) : undefined;
      let offset = 0;
      for (const item of items) {
        const transform = lib.Util.transform(viewport.transform, item.transform);
        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.position = 'absolute'; span.style.left = `${transform[4]}px`; span.style.top = `${transform[5] - Math.hypot(transform[2], transform[3])}px`;
        span.style.fontSize = `${Math.hypot(transform[2], transform[3])}px`;
        span.style.color = 'transparent'; span.style.whiteSpace = 'pre';
        if (match && offset < match.end && offset + item.str.length > match.start) { span.style.backgroundColor = 'rgba(255, 220, 0, 0.45)'; span.dataset.highlight = 'true'; }
        layer.current.append(span); offset += item.str.length + 1;
      }
      if (quote && page === (initialPage ?? 1)) container.current?.scrollIntoView({ block: 'start' });
    })().catch((err: unknown) => { if (!cancelled && !(err instanceof Error && err.name === 'RenderingCancelledException')) setError(true); });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, page, scale, quote, initialPage]);

  useEffect(() => { container.current?.querySelector('mark')?.scrollIntoView({ block: 'center' }); }, [text, quote]);
  if (!isPdf && !isText) return null;
  if (error) return <div role="alert">Could not load the document. <Button variant="outline" onClick={retry}>Retry</Button></div>;
  if (isText) {
    if (text === undefined) return <p role="status">Loading document…</p>;
    const match = quote ? findPassage(text, quote) : undefined;
    return <div ref={container} className="max-h-[70vh] overflow-auto rounded-lg border p-4"><pre className="whitespace-pre-wrap break-words">{match ? <>{text.slice(0, match.start)}<mark>{text.slice(match.start, match.end)}</mark>{text.slice(match.end)}</> : text}</pre></div>;
  }
  return <div ref={container} className="space-y-3 rounded-lg border p-4">
    {!pdf ? <p role="status">Loading document…</p> : <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span>Page {Math.min(page, pdf.numPages)} of {pdf.numPages}</span>
      <Button variant="outline" disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}>Next</Button>
      <Button variant="outline" onClick={() => setScale(Math.max(0.5, scale - 0.2))}>Zoom out</Button>
      <Button variant="outline" onClick={() => setScale(Math.min(3, scale + 0.2))}>Zoom in</Button>
      <Button variant="outline" onClick={() => { void pdf.getPage(Math.min(page, pdf.numPages)).then((p) => setScale(Math.max(0.5, ((container.current?.clientWidth ?? 600) - 40) / p.getViewport({ scale: 1 }).width))); }}>Fit width</Button>
    </div>}
    <div className="overflow-auto"><div className="relative w-fit"><canvas ref={canvas} /><div ref={layer} className="absolute left-0 top-0" /></div></div>
  </div>;
}
