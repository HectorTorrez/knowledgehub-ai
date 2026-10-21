import { Module } from '@nestjs/common';
import {
  FACT_EXTRACTOR,
  type FactExtractor,
} from './fact-extractor.port.js';
import { FactsBackfillService } from './facts-backfill.service.js';
import { FactsConfig } from './facts.config.js';
import { FactsService } from './facts.service.js';
import { FactsStore } from './facts.store.js';
import { OpenAiFactExtractor } from './openai-fact-extractor.js';

@Module({
  providers: [
    FactsConfig,
    FactsStore,
    FactsService,
    FactsBackfillService,
    {
      provide: FACT_EXTRACTOR,
      inject: [FactsConfig],
      useFactory: (config: FactsConfig): FactExtractor =>
        new OpenAiFactExtractor({
          apiKey: config.apiKey,
          model: config.model,
          timeoutMs: config.timeoutMs,
          maxOutputTokens: config.maxOutputTokens,
          baseUrl: config.baseUrl,
        }),
    },
  ],
  exports: [FactsConfig, FactsService, FactsStore],
})
export class FactsModule {}
