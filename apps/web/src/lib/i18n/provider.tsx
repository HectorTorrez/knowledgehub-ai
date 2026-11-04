import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale } from './locale';
import { createTranslator, type Translator } from './translate';

interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLocale,
  onLocaleChange,
  children,
}: Readonly<{
  initialLocale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
}>) {
  const [locale, setLocaleState] = useState(initialLocale);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (next) => {
        setLocaleState(next);
        onLocaleChange(next);
      },
    }),
    [locale, onLocaleChange],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

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
