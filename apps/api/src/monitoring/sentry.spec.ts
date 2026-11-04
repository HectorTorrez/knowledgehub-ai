import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { initializeSentry, scrubEvent } from './sentry.js';

vi.mock('@sentry/node', () => ({ init: vi.fn() }));

describe('Sentry privacy', () => {
  it('does not initialize without a DSN', () => {
    const init = vi.mocked(Sentry.init);
    initializeSentry(undefined);
    expect(init).not.toHaveBeenCalled();
    init.mockClear();
  });

  it('drops sensitive event data', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'question',
      user: { email: 'private@example.com' },
      request: {
        data: 'document',
        cookies: { session: 'secret' },
        headers: { Authorization: 'secret' },
      },
      exception: { values: [{ type: 'Error', value: 'document content' }] },
      tags: {
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
        other: 'private',
      },
    });
    expect(event).not.toHaveProperty('message');
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('request');
    expect(event.exception?.values?.[0]).not.toHaveProperty('value');
    expect(event.tags).toEqual({
      organizationId: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('keeps code locations so errors can be traced', () => {
    const event = scrubEvent({
      type: undefined,
      environment: 'staging',
      exception: {
        values: [
          {
            type: 'PrismaClientKnownRequestError',
            value: 'Unique constraint failed on email private@example.com',
            stacktrace: {
              frames: [
                {
                  filename: '/app/dist/answers/answers.service.js',
                  function: 'AnswersService.ask',
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                  vars: { question: 'private' },
                },
              ],
            },
          },
        ],
      },
    });
    expect(event.environment).toBe('staging');
    expect(event.exception?.values?.[0]?.type).toBe(
      'PrismaClientKnownRequestError',
    );
    expect(event.exception?.values?.[0]).not.toHaveProperty('value');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: '/app/dist/answers/answers.service.js',
      function: 'AnswersService.ask',
      lineno: 42,
      colno: 7,
      in_app: true,
    });
  });
});
