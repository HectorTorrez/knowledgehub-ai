import type { OcrProvider } from './ocr-provider.port.js';

export interface OpenAiOcrOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export class OpenAiOcrProvider implements OcrProvider {
  constructor(private readonly options: OpenAiOcrOptions) {}

  async recognize(pages: { pageNumber: number; image: Buffer }[]) {
    const result: { pageNumber: number; text: string }[] = [];
    for (const page of pages) {
      const response = await (this.options.fetch ?? fetch)(
        `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.apiKey}`,
          },
          signal: AbortSignal.timeout(this.options.timeoutMs),
          body: JSON.stringify({
            model: this.options.model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Transcribe the text on this page faithfully. Return only the text; return an empty string if there is no text.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${page.image.toString('base64')}`,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );
      if (!response.ok)
        throw new Error(`OCR provider returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      const choices = (
        payload as { choices?: { message?: { content?: unknown } }[] }
      )?.choices;
      const text = choices?.[0]?.message?.content;
      if (typeof text !== 'string')
        throw new Error('OCR provider returned an invalid response');
      result.push({ pageNumber: page.pageNumber, text });
    }
    return result;
  }
}
