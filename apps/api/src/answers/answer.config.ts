import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AnswerConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('ANSWERS_ENABLED') === 'true';
  }

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

  get maxSources(): number {
    return this.config.getOrThrow<number>('ANSWER_MAX_SOURCES');
  }

  get contextMaxChars(): number {
    return this.config.getOrThrow<number>('ANSWER_CONTEXT_MAX_CHARS');
  }

  get minSimilarity(): number {
    return this.config.getOrThrow<number>('ANSWER_MIN_SIMILARITY');
  }

  get baseUrl(): string {
    return this.config.getOrThrow<string>('OPENAI_BASE_URL');
  }
}
