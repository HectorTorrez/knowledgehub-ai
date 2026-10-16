import { Module } from '@nestjs/common';
import { ProcessingJobService } from './processing-job.service.js';

@Module({
  providers: [ProcessingJobService],
  exports: [ProcessingJobService],
})
export class ProcessingModule {}
