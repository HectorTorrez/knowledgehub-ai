import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { FactsModule } from '../facts/facts.module.js';
import { SummariesModule } from '../summaries/summaries.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentChunkStore } from './document-chunk.store.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { InlinePdfExtractor } from './inline-pdf-extractor.js';
import { PDF_EXTRACTOR, type PdfExtractor } from './pdf-extractor.js';
import { PDF_PAGE_RENDERER } from './pdf-page-renderer.port.js';
import { PdfJsPageRenderer } from './pdf-page-renderer.js';
import { OCR_PROVIDER } from './ocr-provider.port.js';
import { OpenAiOcrProvider } from './openai-ocr-provider.js';
import { ProcessingConfig } from './processing.config.js';
import { ProcessingJobService } from './processing-job.service.js';
import { ProcessingWorkerService } from './processing-worker.service.js';
import { WorkerPdfExtractor } from './worker-pdf-extractor.js';

@Module({
  imports: [StorageModule, EmbeddingsModule, FactsModule, SummariesModule],
  providers: [
    ProcessingConfig,
    { provide: PDF_PAGE_RENDERER, useClass: PdfJsPageRenderer },
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService, ProcessingConfig],
      useFactory: (env: ConfigService, config: ProcessingConfig) =>
        new OpenAiOcrProvider({
          apiKey: env.get<string>('OPENAI_API_KEY') ?? '',
          baseUrl: env.getOrThrow<string>('OPENAI_BASE_URL'),
          model: config.ocrModel,
          timeoutMs: config.pdfTimeoutMs,
        }),
    },
    ProcessingJobService,
    DocumentTextExtractor,
    DocumentChunkStore,
    ProcessingWorkerService,
    {
      provide: PDF_EXTRACTOR,
      inject: [ProcessingConfig],
      useFactory: (config: ProcessingConfig): PdfExtractor =>
        config.sandbox === 'worker'
          ? new WorkerPdfExtractor(config)
          : new InlinePdfExtractor(),
    },
  ],
  exports: [
    ProcessingConfig,
    ProcessingJobService,
    DocumentTextExtractor,
    DocumentChunkStore,
    ProcessingWorkerService,
  ],
})
export class ProcessingModule {}
