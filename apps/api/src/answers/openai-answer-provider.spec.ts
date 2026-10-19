import { describe, expect, it, vi } from 'vitest';
import {
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
  type AnswerGeneration,
  type AnswerProvider,
} from './answer-provider.port.js';
import type { AnswerPrompt } from './answer-prompt.js';
import {
  type AnswerFetch,
  type AnswerHttpResponse,
  type OpenAiAnswerProviderOptions,
  OpenAiAnswerProvider,
  parseAnswerResponse,
  parseAnswerUsage,
} from './openai-answer-provider.js';

const API_KEY = 'test-key';
const MODEL = 'gpt-4.1-mini';
const MAX_OUTPUT_TOKENS = 700;

const PROMPT: AnswerPrompt = {
  system: 'Answer from the sources only.',
  user: '<source id="1">Alpha.</source>\n\nQuestion:\nWhat is alpha?',
};

function response(status: number, payload: unknown): AnswerHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function completion(content: string): unknown {
  return {
    choices: [{ message: { role: 'assistant', content } }],
  };
}

function createProvider(
  fetchImpl: AnswerFetch,
  overrides: Partial<OpenAiAnswerProviderOptions> = {},
): OpenAiAnswerProvider {
  return new OpenAiAnswerProvider({
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs: 1_000,
    baseUrl: 'https://example.test/v1/',
    fetch: fetchImpl,
    ...overrides,
  });
}

function generate(provider: AnswerProvider): Promise<AnswerGeneration> {
  return provider.generate(PROMPT, { maxOutputTokens: MAX_OUTPUT_TOKENS });
}

describe('parseAnswerResponse', () => {
  it('returns the parsed draft from the assistant message', () => {
    const draft = {
      status: 'answered',
      claims: [{ text: 'Alpha.', source: 1 }],
    };

    expect(
      parseAnswerResponse(completion(JSON.stringify(draft))),
    ).toEqual(draft);
  });

  it('rejects a payload without completion choices', () => {
    expect(() => parseAnswerResponse({})).toThrow(AnswerResponseError);
    expect(() => parseAnswerResponse({ choices: [] })).toThrow(
      AnswerResponseError,
    );
    expect(() => parseAnswerResponse(null)).toThrow(AnswerResponseError);
  });

  it('rejects a missing or non-string assistant content', () => {
    expect(() =>
      parseAnswerResponse({ choices: [{ message: { content: 42 } }] }),
    ).toThrow(AnswerResponseError);
    expect(() => parseAnswerResponse({ choices: [{}] })).toThrow(
      AnswerResponseError,
    );
  });

  it('rejects assistant content that is not JSON', () => {
    expect(() =>
      parseAnswerResponse(completion('I do not know.')),
    ).toThrow(AnswerResponseError);
  });
});

describe('parseAnswerUsage', () => {
  it('reads prompt and completion tokens from the envelope', () => {
    expect(
      parseAnswerUsage({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 34 },
      }),
    ).toEqual({ inputTokens: 12, outputTokens: 34 });
  });

  it('returns null counts when usage is missing or malformed', () => {
    expect(parseAnswerUsage({ choices: [] })).toEqual({
      inputTokens: null,
      outputTokens: null,
    });
    expect(
      parseAnswerUsage({ usage: { prompt_tokens: 'many', completion_tokens: -1 } }),
    ).toEqual({ inputTokens: null, outputTokens: null });
  });
});

describe('OpenAiAnswerProvider', () => {
  it('sends the model, prompt, output limit, JSON schema, and authorization', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () =>
      response(
        200,
        completion(
          '{"status":"answered","claims":[{"text":"Alpha.","source":1}]}',
        ),
      ),
    );

    await expect(generate(createProvider(fetchImpl))).resolves.toEqual({
      draft: { status: 'answered', claims: [{ text: 'Alpha.', source: 1 }] },
      usage: { inputTokens: null, outputTokens: null },
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.model).toBe(MODEL);
    expect(body.messages).toEqual([
      { role: 'system', content: PROMPT.system },
      { role: 'user', content: PROMPT.user },
    ]);
    expect(body.max_completion_tokens).toBe(MAX_OUTPUT_TOKENS);

    const responseFormat = body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: unknown };
    };
    expect(responseFormat.type).toBe('json_schema');
    expect(responseFormat.json_schema.name).toBe('grounded_answer');
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.schema).toEqual({
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['answered', 'insufficient_evidence'] },
        claims: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              source: { type: 'integer' },
            },
            required: ['text', 'source'],
            additionalProperties: false,
          },
        },
      },
      required: ['status', 'claims'],
      additionalProperties: false,
    });
  });

  it('returns usage metadata alongside the untrusted draft', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () =>
      response(200, {
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '{"status":"answered","claims":[{"text":"Alpha.","source":1}]}',
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 8 },
      }),
    );

    await expect(generate(createProvider(fetchImpl))).resolves.toEqual({
      draft: { status: 'answered', claims: [{ text: 'Alpha.', source: 1 }] },
      usage: { inputTokens: 120, outputTokens: 8 },
    });
  });

  it('returns a refusal draft unchanged', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () =>
      response(
        200,
        completion('{"status":"insufficient_evidence","claims":null}'),
      ),
    );

    await expect(generate(createProvider(fetchImpl))).resolves.toEqual({
      draft: { status: 'insufficient_evidence', claims: null },
      usage: { inputTokens: null, outputTokens: null },
    });
  });

  it.each([429, 500, 502, 503])(
    'treats HTTP %i as a provider that is unavailable',
    async (status) => {
      const fetchImpl = vi.fn<AnswerFetch>(async () =>
        response(status, { error: { message: 'busy' } }),
      );

      await expect(generate(createProvider(fetchImpl))).rejects.toBeInstanceOf(
        AnswerUnavailableError,
      );
    },
  );

  it.each([401, 403])(
    'treats HTTP %i as a configuration rejection',
    async (status) => {
      const fetchImpl = vi.fn<AnswerFetch>(async () =>
        response(status, { error: { message: 'invalid key' } }),
      );

      const error = await generate(createProvider(fetchImpl)).catch(
        (thrown) => thrown,
      );

      expect(error).toBeInstanceOf(AnswerRejectedError);
      expect((error as AnswerRejectedError).source).toBe('configuration');
    },
  );

  it.each([400, 404, 422])(
    'treats HTTP %i as a request rejection',
    async (status) => {
      const fetchImpl = vi.fn<AnswerFetch>(async () =>
        response(status, { error: { message: 'bad request' } }),
      );

      const error = await generate(createProvider(fetchImpl)).catch(
        (thrown) => thrown,
      );

      expect(error).toBeInstanceOf(AnswerRejectedError);
      expect((error as AnswerRejectedError).source).toBe('request');
    },
  );

  it('treats a network failure as a provider that is unavailable', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(generate(createProvider(fetchImpl))).rejects.toBeInstanceOf(
      AnswerUnavailableError,
    );
  });

  it('treats a timeout as a provider that is unavailable', async () => {
    const fetchImpl: AnswerFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });

    await expect(
      generate(createProvider(fetchImpl, { timeoutMs: 5 })),
    ).rejects.toBeInstanceOf(AnswerUnavailableError);
  });

  it('treats an unparseable body as an unusable response', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }));

    await expect(generate(createProvider(fetchImpl))).rejects.toBeInstanceOf(
      AnswerResponseError,
    );
  });

  it('never returns unresolved provider content', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () =>
      response(200, completion('{"status":"answered"')),
    );

    await expect(generate(createProvider(fetchImpl))).rejects.toBeInstanceOf(
      AnswerResponseError,
    );
  });

  it('never leaks the credential or the provider body into an error', async () => {
    const fetchImpl = vi.fn<AnswerFetch>(async () =>
      response(401, { error: { message: `key ${API_KEY} is invalid` } }),
    );

    const error = (await generate(createProvider(fetchImpl)).catch(
      (thrown) => thrown,
    )) as Error;

    expect(error).toBeInstanceOf(AnswerRejectedError);
    expect(error.message).not.toContain(API_KEY);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(
      API_KEY,
    );
    expect(String(error.cause ?? '')).not.toContain(API_KEY);
  });
});
