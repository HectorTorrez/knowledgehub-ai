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
    const event = scrubEvent({ type: undefined, user: { email: 'private@example.com' }, request: { url: 'https://example.com/?q=private&quote=private' }, exception: { values: [{ value: 'question', stacktrace: { frames: [{ filename: 'https://example.com/app.js?q=private' }] } }] } });
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('request');
    expect(event.exception?.values?.[0]?.value).toBeUndefined();
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe('https://example.com/app.js');
  });
});
