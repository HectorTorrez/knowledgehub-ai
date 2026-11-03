import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { initializeSentry, scrubEvent } from './sentry';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

describe('Sentry privacy', () => {
  it('does not initialize without a DSN', () => {
    const init = vi.mocked(Sentry.init);
    initializeSentry(undefined);
    expect(init).not.toHaveBeenCalled();
    init.mockClear();
  });

  it('drops private data and query strings', () => {
    const event = scrubEvent({
      type: undefined,
      environment: 'production',
      user: { email: 'private@example.com' },
      request: { url: 'https://example.com/?q=private&quote=private' },
      breadcrumbs: [{ message: 'typed a question' }],
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'question',
            stacktrace: {
              frames: [
                {
                  filename: 'https://example.com/assets/app.js?q=private',
                  function: 'renderAnswer',
                  lineno: 10,
                  colno: 4,
                  vars: { question: 'private' },
                  context_line: 'const question = input;',
                },
              ],
            },
          },
        ],
      },
    });
    const frame = event.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('request');
    expect(event).not.toHaveProperty('breadcrumbs');
    expect(event.environment).toBe('production');
    expect(event.exception?.values?.[0]?.type).toBe('TypeError');
    expect(event.exception?.values?.[0]?.value).toBeUndefined();
    expect(frame).toEqual({
      filename: 'https://example.com/assets/app.js',
      function: 'renderAnswer',
      lineno: 10,
      colno: 4,
    });
  });
});
