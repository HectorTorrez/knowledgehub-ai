import { MetricsModule } from '../metrics/metrics.module.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { ConfigService } from '@nestjs/config';
import { CachedQueryEmbedding } from './cached-query-embedding.js';
import {
  MemoryQueryCache,
  MeteredQueryCache,
  RedisQueryCache,
  type QueryCache,
} from './query-cache.js';
import { Module } from '@nestjs/common';
import { EmbeddingConfig } from './embedding.config.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding-provider.port.js';
import { OpenAiEmbeddingProvider } from './openai-embedding-provider.js';

export const QUERY_CACHE = Symbol('QUERY_CACHE');
export const QUERY_EMBEDDING_PROVIDER = Symbol('QUERY_EMBEDDING_PROVIDER');

@Module({
  imports: [MetricsModule],
  providers: [
    EmbeddingConfig,
    {
      provide: QUERY_CACHE,
      inject: [ConfigService, MetricsService],
      useFactory: (
        config: ConfigService,
        metrics: MetricsService,
      ): QueryCache => {
        const max = config.get<number>('EMBEDDING_CACHE_MAX_ENTRIES') ?? 1000;
        const ttl = config.get<number>('EMBEDDING_CACHE_TTL_SECONDS') ?? 86400;
        const url = config.get<string>('RATE_LIMIT_REDIS_URL');
        return new MeteredQueryCache(
          url && max && ttl
            ? new RedisQueryCache(url, ttl)
            : new MemoryQueryCache(max, ttl),
          metrics,
        );
      },
    },
    {
      provide: QUERY_EMBEDDING_PROVIDER,
      inject: [EMBEDDING_PROVIDER, QUERY_CACHE, EmbeddingConfig],
      useFactory: (
        provider: EmbeddingProvider,
        cache: QueryCache,
        config: EmbeddingConfig,
      ) => new CachedQueryEmbedding(provider, cache, config.model),
    },
    {
      provide: EMBEDDING_PROVIDER,
      inject: [EmbeddingConfig],
      useFactory: (config: EmbeddingConfig): EmbeddingProvider =>
        new OpenAiEmbeddingProvider({
          apiKey: config.apiKey,
          model: config.model,
          dimensions: config.dimensions,
          batchSize: config.batchSize,
          timeoutMs: config.timeoutMs,
          baseUrl: config.baseUrl,
        }),
    },
  ],
  exports: [
    EMBEDDING_PROVIDER,
    QUERY_EMBEDDING_PROVIDER,
    QUERY_CACHE,
    EmbeddingConfig,
  ],
})
export class EmbeddingsModule {}
