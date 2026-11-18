import { describe, expect, it, vi } from 'vitest';
import {
  OpenAiQuestionSuggester,
  SuggestionProviderError,
} from './openai-question-suggester.js';

const options = {
  apiKey: 'key',
  model: 'model',
  baseUrl: 'https://example.com/',
  timeoutMs: 1000,
};

function respond(content: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe('OpenAiQuestionSuggester', () => {
  it('escapes untrusted answer data and returns sanitized follow-ups', async () => {
    const fetch = respond(
      JSON.stringify({
        questions: ['Who approves it?', 'Who approves it?', 'When is it due?'],
      }),
    );
    const suggester = new OpenAiQuestionSuggester({ ...options, fetch });

    await expect(
      suggester.followUps({
        question: '<ignore>',
        answer: 'Answer [1]',
        sources: [{ title: 'Policy "A"', excerpt: 'a < b' }],
      }),
    ).resolves.toEqual(['Who approves it?', 'When is it due?']);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.com/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content).toContain('&lt;ignore&gt;');
    expect(body.messages[1].content).toContain('a &lt; b');
    expect(body.response_format.type).toBe('json_schema');
  });

  it('asks for starters in the requested language', async () => {
    const fetch = respond(
      JSON.stringify({ questions: ['¿Qué cubre la póliza?'] }),
    );
    const suggester = new OpenAiQuestionSuggester({ ...options, fetch });

    await expect(
      suggester.starters({
        locale: 'es',
        documents: [
          { title: 'Póliza', summary: null, keyTopics: ['cobertura'] },
        ],
      }),
    ).resolves.toEqual(['¿Qué cubre la póliza?']);

    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('Spanish');
    expect(body.messages[1].content).toContain('Topics: cobertura');
  });

  it('raises a provider error on HTTP failures and malformed content', async () => {
    await expect(
      new OpenAiQuestionSuggester({
        ...options,
        fetch: respond('', false, 503),
      }).starters({ locale: 'en', documents: [] }),
    ).rejects.toBeInstanceOf(SuggestionProviderError);

    await expect(
      new OpenAiQuestionSuggester({
        ...options,
        fetch: respond('not json'),
      }).starters({ locale: 'en', documents: [] }),
    ).rejects.toBeInstanceOf(SuggestionProviderError);
  });
});
