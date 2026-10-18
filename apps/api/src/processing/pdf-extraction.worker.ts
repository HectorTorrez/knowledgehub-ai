import { parentPort } from 'node:worker_threads';

interface ExtractionResult {
  pages: { pageNumber: number; content: string }[];
  pageCount: number;
}

parentPort?.on('message', (buffer: ArrayBuffer) => {
  extract(new Uint8Array(buffer))
    .then((result) => parentPort?.postMessage({ ok: true, ...result }))
    .catch(() => parentPort?.postMessage({ ok: false }));
});

async function extract(bytes: Uint8Array): Promise<ExtractionResult> {
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
}
