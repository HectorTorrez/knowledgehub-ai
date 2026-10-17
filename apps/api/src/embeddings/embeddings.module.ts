import { Module } from '@nestjs/common';
import { EmbeddingConfig } from './embedding.config.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.port.js';
import { OpenAiEmbeddingProvider } from './openai-embedding-provider.js';

@Module({
  providers: [
    EmbeddingConfig,
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
  exports: [EMBEDDING_PROVIDER, EmbeddingConfig],
})
export class EmbeddingsModule {}
