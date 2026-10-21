import { describe, expect, it } from 'vitest';
import {
  ANSWER_LIST_DEFAULT_LIMIT,
  ANSWER_LIST_MAX_LIMIT,
  listAnswersSchema,
} from './list-answers.schema.js';

describe('listAnswersSchema', () => {
  it('defaults the limit when omitted', () => {
    expect(listAnswersSchema.parse({})).toEqual({
      limit: ANSWER_LIST_DEFAULT_LIMIT,
      askedBy: 'organization',
    });
  });

  it('coerces a string limit to a number', () => {
    expect(listAnswersSchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects a limit outside the bounds', () => {
    expect(listAnswersSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(
      listAnswersSchema.safeParse({ limit: ANSWER_LIST_MAX_LIMIT + 1 }).success,
    ).toBe(false);
  });

  it('accepts an optional cursor and rejects an empty one', () => {
    expect(listAnswersSchema.parse({ cursor: 'opaque' }).cursor).toBe('opaque');
    expect(listAnswersSchema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('accepts a personal history scope and rejects unknown scopes', () => {
    expect(listAnswersSchema.parse({ askedBy: 'me' }).askedBy).toBe('me');
    expect(listAnswersSchema.safeParse({ askedBy: 'everyone' }).success).toBe(
      false,
    );
  });

  it('rejects unknown properties', () => {
    expect(listAnswersSchema.safeParse({ limit: 10, page: 2 }).success).toBe(
      false,
    );
  });
});
