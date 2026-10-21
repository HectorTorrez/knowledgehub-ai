import {
  type FactExtractionOptions,
  type FactExtractionPage,
  FactExtractionRejectedError,
  FactExtractionResponseError,
  type FactExtractionResult,
  type FactExtractionUsage,
  FactExtractionUnavailableError,
  type FactExtractor,
} from './fact-extractor.port.js';
import {
  buildFactExtractionPrompt,
  FACT_RESPONSE_FORMAT,
} from './fact-extraction-prompt.js';
import type { ExtractedFactDraft } from './facts.policy.js';

export interface FactHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FactFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FactHttpResponse>;

export interface OpenAiFactExtractorOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  baseUrl: string;
  fetch?: FactFetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(entry: Record<string, unknown>, key: string): string {
  const value = entry[key];

  if (typeof value !== 'string') {
    throw new FactExtractionResponseError(
      `A fact entry is missing the string field "${key}"`,
    );
  }

  return value;
}

export function parseFactResponse(payload: unknown): ExtractedFactDraft[] {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.choices) ||
    payload.choices.length === 0
  ) {
    throw new FactExtractionResponseError(
      'The fact provider returned no completion choices',
    );
  }

  const choice = payload.choices[0];

  if (!isRecord(choice)) {
    throw new FactExtractionResponseError(
      'The fact provider returned a malformed choice',
    );
  }

  if (choice.finish_reason === 'length') {
    throw new FactExtractionResponseError(
      'The fact provider truncated the extraction output',
    );
  }

  if (!isRecord(choice.message) || typeof choice.message.content !== 'string') {
    throw new FactExtractionResponseError(
      'The fact provider returned no assistant message content',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(choice.message.content);
  } catch (error) {
    throw new FactExtractionResponseError(
      'The fact provider returned unparseable extraction content',
      { cause: error },
    );
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.facts)) {
    throw new FactExtractionResponseError(
      'The fact provider returned an unexpected extraction shape',
    );
  }

  return parsed.facts.map((entry) => {
    if (!isRecord(entry)) {
      throw new FactExtractionResponseError('A fact entry is not an object');
    }

    return {
      contractId: readString(entry, 'contractId'),
      label: readString(entry, 'label'),
      amountText: readString(entry, 'amountText'),
      currency: readString(entry, 'currency'),
      evidenceText: readString(entry, 'evidenceText'),
    };
  });
}

function parseTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function parseFactUsage(payload: unknown): FactExtractionUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { inputTokens: null, outputTokens: null };
  }

  return {
    inputTokens: parseTokenCount(payload.usage.prompt_tokens),
    outputTokens: parseTokenCount(payload.usage.completion_tokens),
  };
}

export class OpenAiFactExtractor implements FactExtractor {
  private readonly fetch: FactFetch;

  constructor(private readonly options: OpenAiFactExtractorOptions) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async extract(
    page: FactExtractionPage,
    options: FactExtractionOptions = {},
  ): Promise<FactExtractionResult> {
    const response = await this.send(page, options.hint);

    if (!response.ok) {
      throw this.httpError(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new FactExtractionResponseError(
        'The fact provider returned a malformed response body',
        { cause: error },
      );
    }

    return {
      facts: parseFactResponse(payload),
      usage: parseFactUsage(payload),
    };
  }

  private async send(
    page: FactExtractionPage,
    hint?: string,
  ): Promise<FactHttpResponse> {
    const prompt = buildFactExtractionPrompt(page, hint);
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
            max_completion_tokens: this.options.maxOutputTokens,
            response_format: FACT_RESPONSE_FORMAT,
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new FactExtractionUnavailableError(
        'The fact provider could not be reached',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private httpError(status: number): Error {
    if (status === 429 || status >= 500) {
      return new FactExtractionUnavailableError(
        `The fact provider is unavailable (HTTP ${status})`,
      );
    }

    if (status === 401 || status === 403) {
      return new FactExtractionRejectedError(
        `The fact provider rejected the credential (HTTP ${status})`,
        'configuration',
      );
    }

    return new FactExtractionRejectedError(
      `The fact provider rejected the request (HTTP ${status})`,
      'request',
    );
  }
}
