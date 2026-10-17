import type {
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
    status: 'answered',
    answer: 'Default [1].',
  });

  generate(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<unknown> {
    this.calls.push({ prompt, options });
    return this.generateImpl(prompt, options);
  }
}
