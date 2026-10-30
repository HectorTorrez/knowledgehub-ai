import { QUERY_REWRITER } from './query-rewriter.port.js';
import { OpenAiQueryRewriter } from './openai-query-rewriter.js';
import { Module } from '@nestjs/common';
import { AggregationModule } from '../aggregation/aggregation.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FactsModule } from '../facts/facts.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { AnswerConfig } from './answer.config.js';
import {
  ANSWER_PROVIDER,
  type AnswerProvider,
} from './answer-provider.port.js';
import { AnswersController } from './answers.controller.js';
import { AnswersService } from './answers.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { OpenAiAnswerProvider } from './openai-answer-provider.js';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    RetrievalModule,
    AggregationModule,
    FactsModule,
  ],
  controllers: [AnswersController, ConversationsController],
  providers: [
    AnswerConfig,
    {
      provide: QUERY_REWRITER,
      inject: [AnswerConfig],
      useFactory: (config: AnswerConfig) => new OpenAiQueryRewriter({
        apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs, baseUrl: config.baseUrl,
      }),
    },
    AnswersService,
    ConversationsService,
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
