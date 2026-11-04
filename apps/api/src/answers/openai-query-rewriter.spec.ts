import { describe, expect, it, vi } from 'vitest';
import { OpenAiQueryRewriter } from './openai-query-rewriter.js';
import {
  AnswerResponseError,
  AnswerUnavailableError,
} from './answer-provider.port.js';

const options = {
  apiKey: 'key',
  model: 'model',
  baseUrl: 'https://example.com',
  timeoutMs: 1000,
};

describe('OpenAiQueryRewriter', () => {
  it('sends escaped conversation and returns the query', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  standalone query  ' } }],
      }),
    });
    const rewriter = new OpenAiQueryRewriter({ ...options, fetch });
    expect(
      await rewriter.rewrite('what about it?', [
        { question: '<test>', answer: 'answer' },
      ]),
    ).toBe('standalone query');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.com/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('model');
    expect(body.max_completion_tokens).toBe(120);
    expect(body.messages[1].content).toContain('&lt;test&gt;');
  });

  it('rejects invalid output and maps unavailable responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: ' ' } }] }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const rewriter = new OpenAiQueryRewriter({ ...options, fetch });
    await expect(rewriter.rewrite('question', [])).rejects.toBeInstanceOf(
      AnswerResponseError,
    );
    await expect(rewriter.rewrite('question', [])).rejects.toBeInstanceOf(
      AnswerUnavailableError,
    );
  });
});
