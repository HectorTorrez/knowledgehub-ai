import { describe, expect, it } from 'vitest';
import {
  ANSWER_FEEDBACK_COMMENT_MAX_LENGTH,
  setAnswerFeedbackSchema,
} from './set-answer-feedback.schema.js';

describe('setAnswerFeedbackSchema', () => {
  it('accepts a rating with an optional comment', () => {
    expect(setAnswerFeedbackSchema.parse({ value: 'UP' })).toEqual({
      value: 'UP',
    });
    expect(
      setAnswerFeedbackSchema.parse({ value: 'DOWN', comment: '  wrong  ' }),
    ).toEqual({ value: 'DOWN', comment: 'wrong' });
  });

  it('rejects unknown values and extra keys', () => {
    expect(setAnswerFeedbackSchema.safeParse({ value: 'MEH' }).success).toBe(
      false,
    );
    expect(
      setAnswerFeedbackSchema.safeParse({ value: 'UP', score: 1 }).success,
    ).toBe(false);
  });

  it('rejects an overlong comment', () => {
    expect(
      setAnswerFeedbackSchema.safeParse({
        value: 'UP',
        comment: 'a'.repeat(ANSWER_FEEDBACK_COMMENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
