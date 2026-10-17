import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_QUESTION_CHARS } from '../answer-policy.js';
import { answerQuestionSchema } from './answer-question.schema.js';

describe('answerQuestionSchema', () => {
  it('accepts a non-empty question', () => {
    expect(answerQuestionSchema.parse({ question: 'What is alpha?' })).toEqual({
      question: 'What is alpha?',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(
      answerQuestionSchema.parse({ question: '  What is alpha?  ' }).question,
    ).toBe('What is alpha?');
  });

  it('accepts a question of exactly the maximum length', () => {
    const question = 'a'.repeat(MAX_ANSWER_QUESTION_CHARS);

    expect(
      answerQuestionSchema.safeParse({ question }).success,
    ).toBe(true);
  });

  it('rejects a blank or whitespace-only question', () => {
    for (const question of ['', '   ', '\n\t']) {
      expect(answerQuestionSchema.safeParse({ question }).success).toBe(false);
    }
  });

  it('rejects a question longer than the maximum length', () => {
    expect(
      answerQuestionSchema.safeParse({
        question: 'a'.repeat(MAX_ANSWER_QUESTION_CHARS + 1),
      }).success,
    ).toBe(false);
  });

  it('rejects a non-string question', () => {
    for (const question of [123, null, undefined, ['alpha'], { text: 'alpha' }]) {
      expect(answerQuestionSchema.safeParse({ question }).success).toBe(false);
    }
  });

  it('rejects a missing question', () => {
    expect(answerQuestionSchema.safeParse({}).success).toBe(false);
  });

  it('rejects client-supplied scope and retrieval fields', () => {
    for (const extra of [
      { organizationId: randomUUID() },
      { documentIds: [randomUUID()] },
      { limit: 5 },
      { minSimilarity: 0 },
      { model: 'gpt-4.1-mini' },
    ]) {
      expect(
        answerQuestionSchema.safeParse({
          question: 'What is alpha?',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});
