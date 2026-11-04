import { createContext } from 'react';
import type { Locale } from './locale';
import type { Translator } from './translate';

export interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);
