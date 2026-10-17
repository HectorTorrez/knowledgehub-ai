import {
  type AnswerGenerationOptions,
  type AnswerProvider,
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
} from './answer-provider.port.js';
import type { AnswerPrompt } from './answer-prompt.js';

export interface AnswerHttpResponse {
  ok: boolean;
  status: number;
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
      answer: { type: ['string', 'null'] },
    },
    required: ['status', 'answer'],
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

export class OpenAiAnswerProvider implements AnswerProvider {
  private readonly fetch: AnswerFetch;

  constructor(private readonly options: OpenAiAnswerProviderOptions) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async generate(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<unknown> {
    const response = await this.send(prompt, options);

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

    return parseAnswerResponse(payload);
  }

  private async send(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<AnswerHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    timer.unref?.();

    try {
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
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new AnswerUnavailableError(
        'The answer provider could not be reached',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
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
