import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import {
  LOCALE_COOKIE,
  cookieValue,
  parseAcceptLanguage,
  resolveLocale,
  type Locale,
} from './locale';

export const getRequestLocale = createIsomorphicFn()
  .server((): Locale =>
    resolveLocale({
      cookie: getCookie(LOCALE_COOKIE),
      languages: parseAcceptLanguage(getRequestHeader('accept-language')),
    }),
  )
  .client((): Locale =>
    resolveLocale({
      cookie: cookieValue(document.cookie, LOCALE_COOKIE),
      languages: navigator.languages,
    }),
  );

export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
