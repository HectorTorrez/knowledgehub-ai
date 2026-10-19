import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentChunkStore } from './document-chunk.store.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { InlinePdfExtractor } from './inline-pdf-extractor.js';
import { PDF_EXTRACTOR, type PdfExtractor } from './pdf-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import { ProcessingJobService } from './processing-job.service.js';
import { ProcessingWorkerService } from './processing-worker.service.js';
import { WorkerPdfExtractor } from './worker-pdf-extractor.js';

@Module({
  imports: [StorageModule, EmbeddingsModule],
  providers: [
    ProcessingConfig,
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
