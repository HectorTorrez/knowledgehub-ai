import { afterEach, describe, expect, it, vi } from 'vitest';

const workerMock = vi.hoisted(() => {
  class FakeWorker {
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    terminated = false;

    constructor(_path: unknown, _options: unknown) {
      instances.push(this);
    }

    once(event: string, listener: (...args: unknown[]) => void): void {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }

    postMessage(_value: unknown, _transfer?: unknown[]): void {}

    terminate(): Promise<number> {
      this.terminated = true;
      return Promise.resolve(1);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  const instances: FakeWorker[] = [];

  return {
    FakeWorker,
    getInstances: () => instances,
    resetInstances: () => {
      instances.length = 0;
    },
  };
});

vi.mock('node:worker_threads', () => ({ Worker: workerMock.FakeWorker }));

import { DocumentExtractionError } from './document-text-extractor.js';
import { PdfExtractionUnavailableError } from './pdf-extractor.js';
import type { ProcessingConfig } from './processing.config.js';
import { WorkerPdfExtractor } from './worker-pdf-extractor.js';

type FakeWorker = InstanceType<typeof workerMock.FakeWorker>;

function createExtractor(
  overrides: Partial<Record<string, unknown>> = {},
): WorkerPdfExtractor {
  const config = {
    pdfTimeoutMs: 30_000,
    pdfMaxMemoryMb: 512,
    ...overrides,
  } as unknown as ProcessingConfig;
  return new WorkerPdfExtractor(config);
}

function latestWorker(): FakeWorker {
  const instances = workerMock.getInstances();
  const worker = instances[instances.length - 1];
  if (!worker) {
    throw new Error('no worker was created');
  }
  return worker as FakeWorker;
}

describe('WorkerPdfExtractor', () => {
  afterEach(() => {
    workerMock.resetInstances();
    vi.useRealTimers();
  });

  it('resolves the result when the worker reports success', async () => {
    const extractor = createExtractor();
    const promise = extractor.extractPdf(new Uint8Array([1, 2]));

    latestWorker().emit('message', {
      ok: true,
      pages: [{ pageNumber: 1, content: 'hello' }],
      pageCount: 1,
    });

    await expect(promise).resolves.toEqual({
      pages: [{ pageNumber: 1, content: 'hello' }],
      pageCount: 1,
    });
    expect(latestWorker().terminated).toBe(true);
  });

  it('rejects with a document extraction error on a parse failure', async () => {
    const extractor = createExtractor();
    const promise = extractor.extractPdf(new Uint8Array([1]));

    latestWorker().emit('message', { ok: false });

    await expect(promise).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it('rejects when the worker emits an error', async () => {
    const extractor = createExtractor();
    const promise = extractor.extractPdf(new Uint8Array([1]));

    latestWorker().emit('error', new Error('crashed'));

    await expect(promise).rejects.toBeInstanceOf(
      PdfExtractionUnavailableError,
    );
  });

  it('rejects when extraction exceeds the timeout', async () => {
    vi.useFakeTimers();
    const extractor = createExtractor({ pdfTimeoutMs: 5_000 });
    const promise = extractor.extractPdf(new Uint8Array([1]));

    vi.advanceTimersByTime(5_001);

    await expect(promise).rejects.toBeInstanceOf(
      PdfExtractionUnavailableError,
    );
    expect(latestWorker().terminated).toBe(true);
  });

  it('rejects when the worker exits without a result', async () => {
    const extractor = createExtractor();
    const promise = extractor.extractPdf(new Uint8Array([1]));

    latestWorker().emit('exit', 1);

    await expect(promise).rejects.toBeInstanceOf(
      PdfExtractionUnavailableError,
    );
  });
});
