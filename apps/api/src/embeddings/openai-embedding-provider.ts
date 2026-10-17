import {
  type EmbeddingProvider,
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from './embedding-provider.port.js';

export interface EmbeddingHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type EmbeddingFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<EmbeddingHttpResponse>;

export interface OpenAiEmbeddingProviderOptions {
  apiKey: string;
  model: string;
  dimensions: number;
  batchSize: number;
  timeoutMs: number;
  baseUrl: string;
  fetch?: EmbeddingFetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Turns a provider payload into vectors ordered by the caller's input.
 *
 * Placement uses each item's `index`, not its position in `data`, so a provider
 * that returns items out of order still maps every vector to the right chunk.
 * Any count, dimension, index, or value mismatch is rejected rather than
 * truncated, padded, or reordered.
 */
export function parseEmbeddingResponse(
  payload: unknown,
  expectedCount: number,
  dimensions: number,
): number[][] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new EmbeddingResponseError(
      'The embedding provider returned no embedding data',
    );
  }

  const data = payload.data;
  if (data.length !== expectedCount) {
    throw new EmbeddingResponseError(
      `The embedding provider returned ${data.length} embeddings for ${expectedCount} inputs`,
    );
  }

  const vectors: (number[] | undefined)[] = new Array(expectedCount);

  for (const item of data) {
    if (!isRecord(item)) {
      throw new EmbeddingResponseError(
        'The embedding provider returned a malformed embedding',
      );
    }

    const index = item.index;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= expectedCount
    ) {
      throw new EmbeddingResponseError(
        'The embedding provider returned an out-of-range embedding index',
      );
    }

    if (vectors[index] !== undefined) {
      throw new EmbeddingResponseError(
        'The embedding provider returned a duplicate embedding index',
      );
    }

    const embedding = item.embedding;
    if (!Array.isArray(embedding) || embedding.length !== dimensions) {
      throw new EmbeddingResponseError(
        `The embedding provider returned a vector that is not ${dimensions} dimensions`,
      );
    }

    for (const value of embedding) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new EmbeddingResponseError(
          'The embedding provider returned a non-finite vector value',
        );
      }
    }

    vectors[index] = embedding as number[];
  }

  if (vectors.some((vector) => vector === undefined)) {
    throw new EmbeddingResponseError(
      'The embedding provider omitted an embedding for an input',
    );
  }

  return vectors as number[][];
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly fetch: EmbeddingFetch;

  constructor(private readonly options: OpenAiEmbeddingProviderOptions) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += this.options.batchSize) {
      const batch = texts.slice(start, start + this.options.batchSize);
      vectors.push(...(await this.embedBatch(batch)));
    }

    return vectors;
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    const response = await this.send(batch);

    if (!response.ok) {
      throw this.httpError(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new EmbeddingResponseError(
        'The embedding provider returned a malformed response body',
        { cause: error },
      );
    }

    return parseEmbeddingResponse(payload, batch.length, this.options.dimensions);
  }

  private async send(batch: string[]): Promise<EmbeddingHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    timer.unref?.();

    try {
      return await this.fetch(
        `${this.options.baseUrl.replace(/\/+$/, '')}/embeddings`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            input: batch,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new EmbeddingUnavailableError(
        'The embedding provider could not be reached',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private httpError(status: number): Error {
    if (status === 429 || status >= 500) {
      return new EmbeddingUnavailableError(
        `The embedding provider is unavailable (HTTP ${status})`,
      );
    }

    return new EmbeddingRejectedError(
      `The embedding provider rejected the request (HTTP ${status})`,
    );
  }
}
