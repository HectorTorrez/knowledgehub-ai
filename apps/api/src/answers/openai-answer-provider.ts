import {
  type AnswerGeneration,
  type AnswerGenerationChunk,
  type AnswerGenerationOptions,
  type AnswerProvider,
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
  type AnswerUsage,
} from './answer-provider.port.js';
import type { AnswerPrompt } from './answer-prompt.js';

export interface AnswerHttpResponse {
  ok: boolean;
  status: number;
  body?: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
}

export type AnswerFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<AnswerHttpResponse>;

export interface OpenAiAnswerProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl: string;
  fetch?: AnswerFetch;
}

const ANSWER_JSON_SCHEMA = {
  name: 'grounded_answer',
  strict: true,
  schema: {
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
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts the model's structured draft from a Chat Completions envelope.
 *
 * The draft is returned as `unknown` because it is untrusted: the adapter
 * guarantees only that it is parseable JSON, never that it satisfies the answer
 * contract. `validateAnswerContract` remains the single authority for that.
 */
export function parseAnswerResponse(payload: unknown): unknown {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.choices) ||
    payload.choices.length === 0
  ) {
    throw new AnswerResponseError(
      'The answer provider returned no completion choices',
    );
  }

  const choice = payload.choices[0];

  if (
    !isRecord(choice) ||
    !isRecord(choice.message) ||
    typeof choice.message.content !== 'string'
  ) {
    throw new AnswerResponseError(
      'The answer provider returned no assistant message content',
    );
  }

  try {
    return JSON.parse(choice.message.content);
  } catch (error) {
    throw new AnswerResponseError(
      'The answer provider returned unparseable answer content',
      { cause: error },
    );
  }
}

function parseTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function parseAnswerUsage(payload: unknown): AnswerUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { inputTokens: null, outputTokens: null };
  }

  return {
    inputTokens: parseTokenCount(payload.usage.prompt_tokens),
    outputTokens: parseTokenCount(payload.usage.completion_tokens),
  };
}

export function parseStreamData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new AnswerResponseError(
      'The answer provider returned an unparseable stream event',
      { cause: error },
    );
  }
}

export function parseStreamContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return '';
  }

  const choice = payload.choices[0];

  if (!isRecord(choice) || !isRecord(choice.delta)) {
    return '';
  }

  return typeof choice.delta.content === 'string'
    ? choice.delta.content
    : '';
}

export class OpenAiAnswerProvider implements AnswerProvider {
  private readonly fetch: AnswerFetch;

  constructor(private readonly options: OpenAiAnswerProviderOptions) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async generate(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<AnswerGeneration> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    timer.unref?.();

    try {
      const response = await this.send(
        prompt,
        options,
        false,
        controller.signal,
      );

      if (!response.ok) {
        throw this.httpError(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new AnswerResponseError(
          'The answer provider returned a malformed response body',
          { cause: error },
        );
      }

      return {
        draft: parseAnswerResponse(payload),
        usage: parseAnswerUsage(payload),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AnswerUnavailableError(
          'The answer provider timed out',
          { cause: error },
        );
      }

      if (
        error instanceof AnswerRejectedError ||
        error instanceof AnswerUnavailableError ||
        error instanceof AnswerResponseError
      ) {
        throw error;
      }

      throw new AnswerUnavailableError(
        'The answer provider could not be reached',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<AnswerGenerationChunk> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.timeoutMs);
    timer.unref?.();

    const forwardAbort = () => controller.abort();

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', forwardAbort, { once: true });
    }

    let reader: ReturnType<ReadableStream<Uint8Array>['getReader']> | null =
      null;
    let usage: AnswerUsage = { inputTokens: null, outputTokens: null };

    try {
      const response = await this.send(
        prompt,
        options,
        true,
        controller.signal,
      );

      if (!response.ok) {
        throw this.httpError(response.status);
      }

      if (!response.body) {
        throw new AnswerResponseError(
          'The answer provider returned no response stream',
        );
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      while (!finished) {
        let read: { done: boolean; value?: Uint8Array };

        try {
          read = await reader.read();
        } catch (error) {
          if (timedOut) {
            throw new AnswerUnavailableError(
              'The answer provider timed out while streaming',
              { cause: error },
            );
          }

          throw error;
        }

        buffer += read.done
          ? decoder.decode()
          : decoder.decode(read.value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');

        while (newlineIndex >= 0) {
          const line = buffer
            .slice(0, newlineIndex)
            .replace(/\r$/, '')
            .trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');

          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice('data:'.length).trim();

          if (data.length === 0) {
            continue;
          }

          if (data === '[DONE]') {
            finished = true;
            break;
          }

          const payload = parseStreamData(data);

          if (isRecord(payload) && isRecord(payload.usage)) {
            usage = parseAnswerUsage(payload);
          }

          const content = parseStreamContent(payload);

          if (content.length > 0) {
            yield { type: 'delta', text: content };
          }
        }

        if (read.done) {
          finished = true;
        }
      }

      yield { type: 'done', usage };
    } catch (error) {
      if (timedOut) {
        throw new AnswerUnavailableError(
          'The answer provider timed out while streaming',
          { cause: error },
        );
      }

      if (signal?.aborted) {
        throw error;
      }

      if (
        error instanceof AnswerRejectedError ||
        error instanceof AnswerUnavailableError ||
        error instanceof AnswerResponseError
      ) {
        throw error;
      }

      throw new AnswerUnavailableError(
        'The answer provider stream failed',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);

      if (reader !== null) {
        await reader.cancel().catch(() => undefined);
      }
    }
  }

  private async send(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
    stream: boolean,
    signal: AbortSignal,
  ): Promise<AnswerHttpResponse> {
    return await this.fetch(
      `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_completion_tokens: options.maxOutputTokens,
          response_format: {
            type: 'json_schema',
            json_schema: ANSWER_JSON_SCHEMA,
          },
          ...(stream
            ? { stream: true, stream_options: { include_usage: true } }
            : {}),
        }),
        signal,
      },
    );
  }

  private httpError(status: number): Error {
    if (status === 429 || status >= 500) {
      return new AnswerUnavailableError(
        `The answer provider is unavailable (HTTP ${status})`,
      );
    }

    if (status === 401 || status === 403) {
      return new AnswerRejectedError(
        `The answer provider rejected the credential (HTTP ${status})`,
        'configuration',
      );
    }

    return new AnswerRejectedError(
      `The answer provider rejected the request (HTTP ${status})`,
      'request',
    );
  }
}
