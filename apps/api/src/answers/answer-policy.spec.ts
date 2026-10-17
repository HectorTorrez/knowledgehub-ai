import { describe, expect, it } from 'vitest';
import {
  AnswerQuestionError,
  assertAnswerQuestion,
  MAX_ANSWER_QUESTION_CHARS,
} from './answer-policy.js';

describe('assertAnswerQuestion', () => {
  it('accepts a normal question', () => {
    expect(() => assertAnswerQuestion('What is our retry policy?')).not.toThrow();
  });

  it('accepts a question of exactly the maximum length', () => {
    expect(() =>
      assertAnswerQuestion('a'.repeat(MAX_ANSWER_QUESTION_CHARS)),
    ).not.toThrow();
  });

  it('rejects a blank question', () => {
    expect(() => assertAnswerQuestion('')).toThrow(AnswerQuestionError);
  });

  it('rejects a whitespace-only question', () => {
    expect(() => assertAnswerQuestion('   \n\t ')).toThrow(AnswerQuestionError);
  });

  it('rejects a question longer than the maximum', () => {
    expect(() =>
      assertAnswerQuestion('a'.repeat(MAX_ANSWER_QUESTION_CHARS + 1)),
    ).toThrow(AnswerQuestionError);
  });
});
