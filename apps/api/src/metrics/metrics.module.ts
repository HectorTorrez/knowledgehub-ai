import { Module } from '@nestjs/common';
import { MetricsConfig } from './metrics.config.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Module({
  controllers: [MetricsController],
  providers: [MetricsConfig, MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
