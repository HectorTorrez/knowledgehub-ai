import { describe, expect, it } from 'vitest';
import { sharedLink } from './share-target';

describe('sharedLink', () => {
  it('prefers the shared url field', () => {
    expect(
      sharedLink({ url: 'https://example.com/a', text: 'https://other.dev' }),
    ).toBe('https://example.com/a');
  });

  it('finds a link inside shared text when apps put it there', () => {
    expect(
      sharedLink({
        url: '',
        text: 'Read this https://example.com/post?id=1 now',
      }),
    ).toBe('https://example.com/post?id=1');
  });

  it('ignores text without an http link', () => {
    expect(sharedLink({ url: '', text: 'ftp://example.com plain words' })).toBe(
      null,
    );
  });
});
