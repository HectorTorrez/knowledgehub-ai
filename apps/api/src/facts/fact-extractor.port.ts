import type { ExtractedFactDraft } from './facts.policy.js';

export interface FactExtractionPage {
  pageNumber: number;
  content: string;
}

export interface FactExtractionOptions {
  hint?: string;
}

export interface FactExtractionUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface FactExtractionResult {
  facts: ExtractedFactDraft[];
  usage: FactExtractionUsage;
}

export interface FactExtractor {
  extract(
    page: FactExtractionPage,
    options?: FactExtractionOptions,
  ): Promise<FactExtractionResult>;
}

export const FACT_EXTRACTOR = Symbol('FACT_EXTRACTOR');

export class FactExtractionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FactExtractionUnavailableError';
  }
}

export class FactExtractionRejectedError extends Error {
  constructor(
    message: string,
    readonly kind: 'configuration' | 'request',
  ) {
    super(message);
    this.name = 'FactExtractionRejectedError';
  }
}

export class FactExtractionResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FactExtractionResponseError';
  }
}
