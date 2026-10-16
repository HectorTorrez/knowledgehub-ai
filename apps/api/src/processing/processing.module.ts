import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentTextExtractor } from './document-text-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import { ProcessingJobService } from './processing-job.service.js';
import { ProcessingWorkerService } from './processing-worker.service.js';

@Module({
  imports: [StorageModule],
  providers: [
    ProcessingConfig,
    ProcessingJobService,
    DocumentTextExtractor,
    ProcessingWorkerService,
  ],
  exports: [
    ProcessingConfig,
    ProcessingJobService,
    DocumentTextExtractor,
    ProcessingWorkerService,
  ],
})
export class ProcessingModule {}
