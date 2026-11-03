import { describe, expect, it, vi } from 'vitest';
import { OpenAiReranker } from './openai-reranker.js';
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

describe('OpenAiReranker', () => {
  it('requests structured scores and truncates candidate text', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ scores: [{ id: 'a', score: 3 }] }),
            },
          },
        ],
      }),
    });
    const reranker = new OpenAiReranker({ ...options, fetch });
    expect(
      await reranker.rerank('query', [
        { id: 'a', title: 'title', page: 1, text: 'x'.repeat(800) },
      ]),
    ).toEqual([{ id: 'a', score: 3 }]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(
      JSON.parse(body.messages[1].content).candidates[0].text,
    ).toHaveLength(700);
  });
  it('rejects invalid scores and maps provider failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: '{"scores":[{"id":"a","score":4}]}' } },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const reranker = new OpenAiReranker({ ...options, fetch });
    await expect(reranker.rerank('query', [])).rejects.toBeInstanceOf(
      AnswerResponseError,
    );
    await expect(reranker.rerank('query', [])).rejects.toBeInstanceOf(
      AnswerUnavailableError,
    );
  });
});
