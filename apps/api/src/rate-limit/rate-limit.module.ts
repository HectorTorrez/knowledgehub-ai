import { Global, Module } from '@nestjs/common';
import { RateLimitConfig } from './rate-limit.config.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
} from './rate-limit.store.js';
import { UsageService } from './usage.service.js';

@Global()
@Module({
  providers: [
    RateLimitConfig,
    RateLimitGuard,
    UsageService,
    { provide: RATE_LIMIT_STORE, useClass: InMemoryRateLimitStore },
  ],
  exports: [RateLimitGuard, UsageService, RateLimitConfig, RATE_LIMIT_STORE],
})
export class RateLimitModule {}
