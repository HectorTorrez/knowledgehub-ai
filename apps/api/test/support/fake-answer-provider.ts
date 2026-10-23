import type {
  AnswerGeneration,
  AnswerGenerationChunk,
  AnswerGenerationOptions,
  AnswerProvider,
} from '../../src/answers/answer-provider.port.js';
import type { AnswerPrompt } from '../../src/answers/answer-prompt.js';

export class FakeAnswerProvider implements AnswerProvider {
  readonly calls: Array<{
    prompt: AnswerPrompt;
    options: AnswerGenerationOptions;
  }> = [];

  generateImpl: AnswerProvider['generate'] = async () => ({
    draft: { status: 'answered', claims: [{ text: 'Default.', source: 1 }] },
    usage: { inputTokens: null, outputTokens: null },
  });

  generate(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<AnswerGeneration> {
    this.calls.push({ prompt, options });
    return this.generateImpl(prompt, options);
  }

  async *stream(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): AsyncGenerator<AnswerGenerationChunk> {
    this.calls.push({ prompt, options });

    const generation = await this.generateImpl(prompt, options);

    yield { type: 'delta', text: JSON.stringify(generation.draft) };
    yield { type: 'done', usage: generation.usage };
  }
}
