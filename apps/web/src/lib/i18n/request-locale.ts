import { createIsomorphicFn } from '@tanstack/react-start';
import {
  getCookie,
  getRequestHeader,
  setCookie,
} from '@tanstack/react-start/server';
import {
  LOCALE_COOKIE,
  cookieValue,
  parseAcceptLanguage,
  resolveLocale,
  type Locale,
} from './locale';

const LOCALE_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
} as const;

export const getRequestLocale = createIsomorphicFn()
  .server((): Locale => {
    const saved = getCookie(LOCALE_COOKIE);
    const locale = resolveLocale({
      cookie: saved,
      languages: parseAcceptLanguage(getRequestHeader('accept-language')),
    });

    if (saved !== locale) {
      setCookie(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
    }

    return locale;
  })
  .client((): Locale =>
    resolveLocale({
      cookie: cookieValue(document.cookie, LOCALE_COOKIE),
      languages: navigator.languages,
    }),
  );

export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_OPTIONS.maxAge}; samesite=lax`;
}
