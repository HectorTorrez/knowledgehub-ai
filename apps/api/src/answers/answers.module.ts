import { Module } from '@nestjs/common';
import { AnswerConfig } from './answer.config.js';
import {
  ANSWER_PROVIDER,
  type AnswerProvider,
} from './answer-provider.port.js';
import { OpenAiAnswerProvider } from './openai-answer-provider.js';

@Module({
  providers: [
    AnswerConfig,
    {
      provide: ANSWER_PROVIDER,
      inject: [AnswerConfig],
      useFactory: (config: AnswerConfig): AnswerProvider =>
        new OpenAiAnswerProvider({
          apiKey: config.apiKey,
          model: config.model,
          timeoutMs: config.timeoutMs,
          baseUrl: config.baseUrl,
        }),
    },
  ],
  exports: [ANSWER_PROVIDER, AnswerConfig],
})
export class AnswersModule {}
