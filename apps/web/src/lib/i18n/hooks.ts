import { useContext } from 'react';
import type { Locale } from './locale';
import { I18nContext, type I18nValue } from './context';
import type { Translator } from './translate';

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
}

export function useT(): Translator {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale;
}
