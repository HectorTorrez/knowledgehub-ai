import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProcessingConfig {
  constructor(private readonly config: ConfigService) {}

  get workerEnabled(): boolean {
    return (
      this.config.getOrThrow<string>('PROCESSING_WORKER_ENABLED') === 'true'
    );
  }

  get pollIntervalMs(): number {
    return this.config.getOrThrow<number>('PROCESSING_POLL_INTERVAL_MS');
  }

  get renewalIntervalMs(): number {
    return this.config.getOrThrow<number>(
      'PROCESSING_LEASE_RENEWAL_INTERVAL_MS',
    );
  }

  get recoveryIntervalMs(): number {
    return this.config.getOrThrow<number>('PROCESSING_RECOVERY_INTERVAL_MS');
  }
}
