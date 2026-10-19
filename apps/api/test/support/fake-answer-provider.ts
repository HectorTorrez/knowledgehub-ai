import type {
  AnswerGeneration,
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
}
