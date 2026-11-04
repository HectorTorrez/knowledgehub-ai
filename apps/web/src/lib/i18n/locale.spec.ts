import { describe, expect, it } from 'vitest';
import {
  cookieValue,
  localeFromLanguageTags,
  parseAcceptLanguage,
  resolveLocale,
} from './locale';

describe('parseAcceptLanguage', () => {
  it('orders tags by quality and drops zero-quality tags', () => {
    expect(parseAcceptLanguage('fr;q=0.4, es-MX;q=0.9, en;q=0')).toEqual([
      'es-MX',
      'fr',
    ]);
  });

  it('returns an empty list for a missing header', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });
});

describe('localeFromLanguageTags', () => {
  it('maps any Spanish variant to es', () => {
    expect(localeFromLanguageTags(['es-419'])).toBe('es');
    expect(localeFromLanguageTags(['es'])).toBe('es');
  });

  it('uses the first supported language in preference order', () => {
    expect(localeFromLanguageTags(['de-DE', 'es-MX', 'en-US'])).toBe('es');
    expect(localeFromLanguageTags(['en-US', 'es-MX'])).toBe('en');
  });

  it('returns undefined when no supported language is present', () => {
    expect(localeFromLanguageTags(['fr-FR'])).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('prefers the saved cookie over the browser languages', () => {
    expect(resolveLocale({ cookie: 'en', languages: ['es-MX'] })).toBe('en');
  });

  it('ignores an unknown cookie value', () => {
    expect(resolveLocale({ cookie: 'fr', languages: ['es-MX'] })).toBe('es');
  });

  it('falls back to English without a cookie or a supported language', () => {
    expect(resolveLocale({ cookie: undefined, languages: ['fr-FR'] })).toBe(
      'en',
    );
    expect(resolveLocale({ cookie: null, languages: [] })).toBe('en');
  });
});

describe('cookieValue', () => {
  it('reads a named cookie from a Cookie header', () => {
    expect(cookieValue('theme=dark; locale=es; other=1', 'locale')).toBe('es');
  });

  it('returns undefined when the cookie is absent', () => {
    expect(cookieValue('theme=dark', 'locale')).toBeUndefined();
    expect(cookieValue(undefined, 'locale')).toBeUndefined();
  });
});
