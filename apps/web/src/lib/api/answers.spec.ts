import type { AnswerResponse } from '@knowledgehub/shared-types';
import { describe, expect, it } from 'vitest';
import { answerFor } from './answers';

const answered: AnswerResponse = {
  status: 'answered',
  answer: 'Twenty days.',
  citations: [],
};

describe('answerFor', () => {
  it('returns the answer for the organization it was asked in', () => {
    expect(
      answerFor({ organizationId: 'org-a', question: 'How many days?' }, answered, 'org-a'),
    ).toBe(answered);
  });

  it('never returns an answer under a different organization', () => {
    expect(
      answerFor({ organizationId: 'org-a', question: 'How many days?' }, answered, 'org-b'),
    ).toBeUndefined();
  });

  it('returns nothing before a question has been asked', () => {
    expect(answerFor(undefined, answered, 'org-a')).toBeUndefined();
  });
});
