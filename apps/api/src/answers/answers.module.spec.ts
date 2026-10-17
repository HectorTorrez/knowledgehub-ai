import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '../config/env.validation.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AnswerConfig } from './answer.config.js';
import { ANSWER_PROVIDER } from './answer-provider.port.js';
import { AnswersModule } from './answers.module.js';
import { OpenAiAnswerProvider } from './openai-answer-provider.js';

describe('AnswersModule wiring', () => {
  it('resolves the provider token to the OpenAI adapter', async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/db';
    process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: validateEnv,
        }),
        PrismaModule,
        AnswersModule,
      ],
    }).compile();

    expect(moduleRef.get(ANSWER_PROVIDER)).toBeInstanceOf(
      OpenAiAnswerProvider,
    );
    expect(moduleRef.get(AnswerConfig).model).toBe('gpt-4.1-mini');
  });
});
