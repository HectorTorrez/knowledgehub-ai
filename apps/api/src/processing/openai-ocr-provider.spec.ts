import { describe, expect, it, vi } from 'vitest';
import { OpenAiOcrProvider } from './openai-ocr-provider.js';

describe('OpenAiOcrProvider', () => {
  it('sends page images and preserves page numbers', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Hello' } }] }),
        ),
      );
    const provider = new OpenAiOcrProvider({
      apiKey: 'key',
      model: 'vision',
      baseUrl: 'https://example.com/v1',
      timeoutMs: 1000,
      fetch: request,
    });
    await expect(
      provider.recognize([{ pageNumber: 3, image: Buffer.from('image') }]),
    ).resolves.toEqual([{ pageNumber: 3, text: 'Hello' }]);
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as {
      model: string;
      messages: unknown[];
    };
    expect(body.model).toBe('vision');
    expect(JSON.stringify(body.messages)).toContain(
      'data:image/png;base64,aW1hZ2U=',
    );
  });

  it('rejects malformed responses', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const provider = new OpenAiOcrProvider({
      apiKey: 'key',
      model: 'vision',
      baseUrl: 'https://example.com',
      timeoutMs: 1000,
      fetch: request,
    });
    await expect(
      provider.recognize([{ pageNumber: 1, image: Buffer.alloc(0) }]),
    ).rejects.toThrow('invalid response');
  });
});
