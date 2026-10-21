import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_FACTS_TIMEOUT_MS = 60_000;

export const DEFAULT_FACTS_MAX_INPUT_CHARS = 20_000;

export const DEFAULT_FACTS_MAX_OUTPUT_TOKENS = 8_000;

export const MAX_FACTS_OUTPUT_TOKENS = 16_000;

export const DEFAULT_FACTS_BACKFILL_BATCH = 5;

export const DEFAULT_FACTS_CURRENCIES = 'USD';

export function parseCurrencyList(raw: string): ReadonlySet<string> {
  return new Set(
    raw
      .split(',')
      .map((currency) => currency.trim().toUpperCase())
      .filter((currency) => currency.length > 0),
  );
}

@Injectable()
export class FactsConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('FACTS_ENABLED') === 'true';
  }

  get backfillEnabled(): boolean {
    return this.config.get<string>('FACTS_BACKFILL_ENABLED') !== 'false';
  }

  get apiKey(): string {
    return this.config.get<string>('OPENAI_API_KEY') ?? '';
  }

  get model(): string {
    return this.config.getOrThrow<string>('FACTS_MODEL');
  }

  get timeoutMs(): number {
    return this.config.getOrThrow<number>('FACTS_TIMEOUT_MS');
  }

  get maxInputChars(): number {
    return this.config.getOrThrow<number>('FACTS_MAX_INPUT_CHARS');
  }

  get maxOutputTokens(): number {
    return this.config.getOrThrow<number>('FACTS_MAX_OUTPUT_TOKENS');
  }

  get currencies(): ReadonlySet<string> {
    return parseCurrencyList(
      this.config.get<string>('FACTS_CURRENCIES') ?? DEFAULT_FACTS_CURRENCIES,
    );
  }

  get backfillBatch(): number {
    return this.config.getOrThrow<number>('FACTS_BACKFILL_BATCH');
  }

  get baseUrl(): string {
    return this.config.getOrThrow<string>('OPENAI_BASE_URL');
  }
}
