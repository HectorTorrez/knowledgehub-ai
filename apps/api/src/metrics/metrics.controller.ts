import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsConfig } from './metrics.config.js';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: MetricsConfig,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  index(@Res() response: Response): void {
    response.setHeader(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );

    if (!this.config.enabled) {
      response.status(503).json({
        statusCode: 503,
        message: 'Metrics are not enabled',
        error: 'Service Unavailable',
      });
      return;
    }

    response.send(this.metrics.render());
  }
}
