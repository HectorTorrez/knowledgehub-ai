import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { DocumentExtractionError } from './document-text-extractor.js';
import {
  PdfExtractionUnavailableError,
  type PdfExtractionResult,
  type PdfExtractor,
} from './pdf-extractor.js';
import { ProcessingConfig } from './processing.config.js';

interface WorkerMessage {
  ok: boolean;
  pages?: { pageNumber: number; content: string }[];
  pageCount?: number;
}

@Injectable()
export class WorkerPdfExtractor implements PdfExtractor {
  constructor(private readonly config: ProcessingConfig) {}

  async extractPdf(bytes: Uint8Array): Promise<PdfExtractionResult> {
    return new Promise<PdfExtractionResult>((resolve, reject) => {
      const worker = new Worker(
        new URL('./pdf-extraction.worker.js', import.meta.url),
        {
          resourceLimits: {
            maxOldGenerationSizeMb: this.config.pdfMaxMemoryMb,
            maxYoungGenerationSizeMb: Math.max(
              8,
              Math.floor(this.config.pdfMaxMemoryMb / 4),
            ),
          },
        },
      );

      let settled = false;

      const finish = (handler: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        handler();
      };

      const timer = setTimeout(() => {
        finish(() => {
          void worker.terminate();
          reject(new PdfExtractionUnavailableError('PDF extraction timed out'));
        });
      }, this.config.pdfTimeoutMs);
      timer.unref?.();

      worker.once('message', (message: WorkerMessage) => {
        finish(() => {
          void worker.terminate();
          if (
            message.ok &&
            Array.isArray(message.pages) &&
            typeof message.pageCount === 'number'
          ) {
            resolve({ pages: message.pages, pageCount: message.pageCount });
            return;
          }
          reject(new DocumentExtractionError('The PDF could not be parsed'));
        });
      });

      worker.once('error', (error) => {
        finish(() => {
          reject(
            new PdfExtractionUnavailableError(
              'PDF extraction worker failed',
              { cause: error },
            ),
          );
        });
      });

      worker.once('exit', (code) => {
        finish(() => {
          reject(
            new PdfExtractionUnavailableError(
              `PDF extraction worker exited without a result (code ${code})`,
            ),
          );
        });
      });

      const buffer = bytes.buffer as ArrayBuffer;
      worker.postMessage(buffer, [buffer]);
    });
  }
}
