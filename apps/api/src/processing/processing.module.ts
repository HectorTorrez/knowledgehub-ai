import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentChunkStore } from './document-chunk.store.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import { ProcessingJobService } from './processing-job.service.js';
import { ProcessingWorkerService } from './processing-worker.service.js';

@Module({
  imports: [StorageModule, EmbeddingsModule],
  providers: [
    ProcessingConfig,
    ProcessingJobService,
    DocumentTextExtractor,
    DocumentChunkStore,
    ProcessingWorkerService,
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
