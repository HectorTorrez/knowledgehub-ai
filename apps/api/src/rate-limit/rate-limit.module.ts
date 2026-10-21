import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitConfig } from './rate-limit.config.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RedisRateLimitStore,
} from './rate-limit.store.js';
import { UsageService } from './usage.service.js';

@Global()
@Module({
  providers: [
    RateLimitConfig,
    RateLimitGuard,
    UsageService,
    {
      provide: RATE_LIMIT_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const inMemory = new InMemoryRateLimitStore();
        const redisUrl = config.get<string>('RATE_LIMIT_REDIS_URL');

        return redisUrl
          ? new RedisRateLimitStore(redisUrl, inMemory)
          : inMemory;
      },
    },
  ],
  exports: [RateLimitGuard, UsageService, RateLimitConfig, RATE_LIMIT_STORE],
})
export class RateLimitModule {}
