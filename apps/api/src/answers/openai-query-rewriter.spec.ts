import { describe, expect, it, vi } from 'vitest';
import { OpenAiQueryRewriter } from './openai-query-rewriter.js';
import { AnswerRejectedError, AnswerResponseError, AnswerUnavailableError } from './answer-provider.port.js';

const options = { apiKey: 'key', model: 'model', baseUrl: 'https://example.com/v1/', timeoutMs: 1000 };

describe('OpenAiQueryRewriter', () => {
  it('sends a structured request with escaped history and parses the query', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"query":" standalone "}' } }] }) }));
    const rewriter = new OpenAiQueryRewriter({ ...options, fetch });
    expect(await rewriter.rewrite('Next?', [{ question: '<test>', answer: '& yes' }])).toBe('standalone');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://example.com/v1/chat/completions');
    expect(body.max_completion_tokens).toBe(120);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content).toContain('&lt;test&gt;');
    expect(body.messages[1].content).toContain('&amp; yes');
  });

  it.each(['', ' ', 'x'.repeat(2001)])('rejects invalid query output', async (query) => {
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ query }) } }] }) });
    await expect(new OpenAiQueryRewriter({ ...options, fetch }).rewrite('q', [])).rejects.toBeInstanceOf(AnswerResponseError);
  });

  it.each([[401, AnswerRejectedError], [429, AnswerUnavailableError], [500, AnswerUnavailableError]])('maps HTTP %i', async (status, error) => {
    const fetch = async () => ({ ok: false, status, json: async () => ({}) });
    await expect(new OpenAiQueryRewriter({ ...options, fetch }).rewrite('q', [])).rejects.toBeInstanceOf(error);
  });
});
