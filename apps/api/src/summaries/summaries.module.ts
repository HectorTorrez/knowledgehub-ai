import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FactsModule } from '../facts/facts.module.js';
import { SummariesService } from './summaries.service.js';
import { OpenAiSummarizer, SUMMARIZER } from './summarizer.js';

@Module({
  imports: [FactsModule],
  providers: [
    SummariesService,
    {
      provide: SUMMARIZER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenAiSummarizer({
          apiKey: config.get<string>('OPENAI_API_KEY') ?? '',
          model:
            config.get<string>('SUMMARY_MODEL') ??
            config.getOrThrow<string>('ANSWER_MODEL'),
          baseUrl: config.getOrThrow<string>('OPENAI_BASE_URL'),
        }),
    },
  ],
  exports: [SummariesService],
})
export class SummariesModule {}
