import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetricsConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.getOrThrow<string>('METRICS_ENABLED') === 'true';
  }
}
