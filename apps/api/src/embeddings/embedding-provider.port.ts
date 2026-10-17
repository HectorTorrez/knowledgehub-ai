export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * The provider rejected the request as invalid (bad input, over the model's
 * limit, or a rejected credential). Retrying the same request cannot succeed, so
 * processing must not loop on it.
 */
export class EmbeddingRejectedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingRejectedError';
  }
}

/**
 * The provider was unreachable, rate-limited, or failed transiently. Safe to
 * retry within the bounded processing retry budget.
 */
export class EmbeddingUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingUnavailableError';
  }
}

/**
 * The provider answered but the body was not a usable embedding set (wrong
 * count, wrong dimension, non-finite value, missing or duplicated index).
 * Treated as transient: it may be a passing provider fault.
 */
export class EmbeddingResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingResponseError';
  }
}
