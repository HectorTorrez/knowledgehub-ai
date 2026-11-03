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

  get queryRewriteEnabled(): boolean {
    return this.config.get<string>('QUERY_REWRITE_ENABLED') !== 'false';
  }

  get queryRewriteModel(): string {
    return this.config.get<string>('QUERY_REWRITE_MODEL') ?? this.model;
  }

  get rerankEnabled(): boolean {
    return this.config.get<string>('RERANK_ENABLED') === 'true';
  }

  get rerankModel(): string {
    return this.config.get<string>('RERANK_MODEL') ?? this.model;
  }

  get rerankCandidates(): number {
    return this.config.get<number>('RERANK_CANDIDATES') ?? 30;
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

  get historyMaxChars(): number {
    return this.config.getOrThrow<number>('ANSWER_HISTORY_MAX_CHARS');
  }

  get baseUrl(): string {
    return this.config.getOrThrow<string>('OPENAI_BASE_URL');
  }
}
