import { describe, expect, it, vi } from 'vitest';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from './embedding-provider.port.js';
import {
  type EmbeddingFetch,
  type EmbeddingHttpResponse,
  type OpenAiEmbeddingProviderOptions,
  OpenAiEmbeddingProvider,
  parseEmbeddingResponse,
} from './openai-embedding-provider.js';

const DIMENSIONS = 4;

const vector = (value = 0): number[] =>
  Array.from({ length: DIMENSIONS }, () => value);

function response(status: number, payload: unknown): EmbeddingHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function createProvider(
  fetchImpl: EmbeddingFetch,
  overrides: Partial<OpenAiEmbeddingProviderOptions> = {},
): OpenAiEmbeddingProvider {
  return new OpenAiEmbeddingProvider({
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
    dimensions: DIMENSIONS,
    batchSize: 2,
    timeoutMs: 1_000,
    baseUrl: 'https://example.test/v1/',
    fetch: fetchImpl,
    ...overrides,
  });
}

describe('parseEmbeddingResponse', () => {
  it('places vectors by their response index, not their array position', () => {
    const parsed = parseEmbeddingResponse(
      {
        data: [
          { index: 1, embedding: vector(1) },
          { index: 0, embedding: vector(0) },
        ],
      },
      2,
      DIMENSIONS,
    );

    expect(parsed).toEqual([vector(0), vector(1)]);
  });

  it('rejects a response with the wrong number of embeddings', () => {
    expect(() =>
      parseEmbeddingResponse({ data: [{ index: 0, embedding: vector() }] }, 2, DIMENSIONS),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects a vector of the wrong dimension', () => {
    expect(() =>
      parseEmbeddingResponse(
        { data: [{ index: 0, embedding: [1, 2, 3] }] },
        1,
        DIMENSIONS,
      ),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects a non-finite vector value', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        parseEmbeddingResponse(
          { data: [{ index: 0, embedding: [bad, 0, 0, 0] }] },
          1,
          DIMENSIONS,
        ),
      ).toThrow(EmbeddingResponseError);
    }
  });

  it('rejects a non-numeric vector value rather than coercing it', () => {
    expect(() =>
      parseEmbeddingResponse(
        { data: [{ index: 0, embedding: ['1', 0, 0, 0] }] },
        1,
        DIMENSIONS,
      ),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects a missing embedding', () => {
    expect(() =>
      parseEmbeddingResponse({ data: [{ index: 0 }] }, 1, DIMENSIONS),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects a duplicated index', () => {
    expect(() =>
      parseEmbeddingResponse(
        {
          data: [
            { index: 0, embedding: vector() },
            { index: 0, embedding: vector() },
          ],
        },
        2,
        DIMENSIONS,
      ),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects an out-of-range index', () => {
    expect(() =>
      parseEmbeddingResponse(
        { data: [{ index: 5, embedding: vector() }] },
        1,
        DIMENSIONS,
      ),
    ).toThrow(EmbeddingResponseError);
  });

  it('rejects a payload without embedding data', () => {
    expect(() => parseEmbeddingResponse({}, 1, DIMENSIONS)).toThrow(
      EmbeddingResponseError,
    );
    expect(() => parseEmbeddingResponse(null, 1, DIMENSIONS)).toThrow(
      EmbeddingResponseError,
    );
  });
});

describe('OpenAiEmbeddingProvider', () => {
  it('returns no vectors and makes no request for empty input', async () => {
    const fetchImpl = vi.fn<EmbeddingFetch>();

    await expect(createProvider(fetchImpl).embed([])).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends the model and input and returns valid embeddings', async () => {
    const fetchImpl = vi.fn<EmbeddingFetch>(async () =>
      response(200, { data: [{ index: 0, embedding: vector(0.5) }] }),
    );

    await expect(createProvider(fetchImpl).embed(['hello'])).resolves.toEqual([
      vector(0.5),
    ]);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://example.test/v1/embeddings');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body)).toEqual({
      model: 'text-embedding-3-small',
      input: ['hello'],
      encoding_format: 'float',
    });
  });

  it('batches the input and preserves the caller order across batches', async () => {
    const fetchImpl = vi.fn<EmbeddingFetch>(async (_url, init) => {
      const { input } = JSON.parse(init.body) as { input: string[] };
      return response(200, {
        data: input.map((text, index) => ({
          index,
          embedding: [Number(text), 0, 0, 0],
        })),
      });
    });

    const vectors = await createProvider(fetchImpl).embed([
      '0',
      '1',
      '2',
      '3',
      '4',
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(vectors.map((embedding) => embedding[0])).toEqual([0, 1, 2, 3, 4]);

    const batchSizes = fetchImpl.mock.calls.map(
      ([, init]) => (JSON.parse(init.body) as { input: string[] }).input.length,
    );
    expect(batchSizes).toEqual([2, 2, 1]);
  });

  it.each([429, 500, 503])(
    'treats HTTP %i as a transient provider failure',
    async (status) => {
      const fetchImpl = vi.fn<EmbeddingFetch>(async () =>
        response(status, { error: { message: 'busy' } }),
      );

      await expect(createProvider(fetchImpl).embed(['x'])).rejects.toBeInstanceOf(
        EmbeddingUnavailableError,
      );
    },
  );

  it.each([400, 401, 403, 422])(
    'treats HTTP %i as a permanent rejection',
    async (status) => {
      const fetchImpl = vi.fn<EmbeddingFetch>(async () =>
        response(status, { error: { message: 'rejected' } }),
      );

      await expect(createProvider(fetchImpl).embed(['x'])).rejects.toBeInstanceOf(
        EmbeddingRejectedError,
      );
    },
  );

  it('treats a network failure as a transient provider failure', async () => {
    const fetchImpl = vi.fn<EmbeddingFetch>(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(createProvider(fetchImpl).embed(['x'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('treats a timeout as a transient provider failure', async () => {
    const fetchImpl: EmbeddingFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });

    await expect(
      createProvider(fetchImpl, { timeoutMs: 5 }).embed(['x']),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it('treats an unparseable body as a malformed response', async () => {
    const fetchImpl = vi.fn<EmbeddingFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }));

    await expect(createProvider(fetchImpl).embed(['x'])).rejects.toBeInstanceOf(
      EmbeddingResponseError,
    );
  });
});
