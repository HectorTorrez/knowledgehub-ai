import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AnswerConfig {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string {
    return this.config.get<string>('OPENAI_API_KEY') ?? '';
  }

  get model(): string {
    return this.config.getOrThrow<string>('ANSWER_MODEL');
  }

  get timeoutMs(): number {
    return this.config.getOrThrow<number>('ANSWER_TIMEOUT_MS');
  }

  get maxOutputTokens(): number {
    return this.config.getOrThrow<number>('ANSWER_MAX_OUTPUT_TOKENS');
  }

  get baseUrl(): string {
    return this.config.getOrThrow<string>('OPENAI_BASE_URL');
  }
}
