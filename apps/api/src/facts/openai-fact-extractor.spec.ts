import { describe, expect, it, vi } from 'vitest';
import {
  FactExtractionRejectedError,
  FactExtractionResponseError,
  FactExtractionUnavailableError,
} from './fact-extractor.port.js';
import {
  OpenAiFactExtractor,
  type FactFetch,
} from './openai-fact-extractor.js';

const PAGE = {
  pageNumber: 2,
  content: '1143 Plan Personalizado $500.00',
};

function completion(content: string, finishReason = 'stop') {
  return {
    choices: [
      {
        finish_reason: finishReason,
        message: { content },
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 40 },
  };
}

function createExtractor(fetchImpl: FactFetch) {
  return new OpenAiFactExtractor({
    apiKey: 'test-key',
    model: 'gpt-4.1-mini',
    timeoutMs: 1_000,
    maxOutputTokens: 4_000,
    baseUrl: 'https://example.test/v1',
    fetch: fetchImpl,
  });
}

describe('OpenAiFactExtractor', () => {
  it('returns parsed facts and usage', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        completion(
          JSON.stringify({
            facts: [
              {
                contractId: '1143',
                label: 'Plan Personalizado',
                amountText: '$500.00',
                currency: 'USD',
                evidenceText: '1143 Plan Personalizado $500.00',
              },
            ],
          }),
        ),
    }));

    const result = await createExtractor(fetchMock).extract(PAGE);

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.amountText).toBe('$500.00');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
  });

  it('sends the strict fact schema and the page as untrusted data', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => completion('{"facts":[]}'),
    }));

    await createExtractor(fetchMock).extract(PAGE);

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body) as {
      model: string;
      max_completion_tokens: number;
      response_format: { type: string; json_schema: { name: string } };
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.max_completion_tokens).toBe(4_000);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('contract_facts');
    expect(body.messages[0]?.content).toContain('untrusted');
    expect(body.messages[1]?.content).toContain('<page>');
  });

  it('appends a correction hint when a page was short', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => completion('{"facts":[]}'),
    }));

    await createExtractor(fetchMock).extract(PAGE, {
      hint: 'The amount $9.00 has no row.',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.messages[1]?.content).toContain('Correction hint');
    expect(body.messages[1]?.content).toContain('$9.00');
  });

  it('fails closed when the provider truncates the output', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => completion('{"facts":[]}', 'length'),
    }));

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toBeInstanceOf(
      FactExtractionResponseError,
    );
  });

  it('rejects an unexpected extraction shape', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => completion('{"rows":[]}'),
    }));

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toBeInstanceOf(
      FactExtractionResponseError,
    );
  });

  it('rejects a fact entry with a non-string field', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () =>
        completion(
          JSON.stringify({
            facts: [
              {
                contractId: 1143,
                label: 'Plan',
                amountText: '$500.00',
                currency: 'USD',
                evidenceText: '1143 Plan $500.00',
              },
            ],
          }),
        ),
    }));

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toBeInstanceOf(
      FactExtractionResponseError,
    );
  });

  it('maps a 429 response to an unavailable error', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toBeInstanceOf(
      FactExtractionUnavailableError,
    );
  });

  it('maps a rejected credential to a configuration error', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toMatchObject({
      name: 'FactExtractionRejectedError',
      kind: 'configuration',
    });
    expect(FactExtractionRejectedError).toBeDefined();
  });

  it('maps a transport failure to an unavailable error', async () => {
    const fetchMock = vi.fn<FactFetch>(async () => {
      throw new Error('socket hang up');
    });

    await expect(createExtractor(fetchMock).extract(PAGE)).rejects.toBeInstanceOf(
      FactExtractionUnavailableError,
    );
  });
});
