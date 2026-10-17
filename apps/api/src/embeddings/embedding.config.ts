import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingConfig {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string {
    return this.config.get<string>('OPENAI_API_KEY') ?? '';
  }

  get model(): string {
    return this.config.getOrThrow<string>('EMBEDDING_MODEL');
  }

  get dimensions(): number {
    return this.config.getOrThrow<number>('EMBEDDING_DIMENSIONS');
  }

  get batchSize(): number {
    return this.config.getOrThrow<number>('EMBEDDING_BATCH_SIZE');
  }

  get timeoutMs(): number {
    return this.config.getOrThrow<number>('EMBEDDING_TIMEOUT_MS');
  }

  get baseUrl(): string {
    return this.config.getOrThrow<string>('OPENAI_BASE_URL');
  }
}
