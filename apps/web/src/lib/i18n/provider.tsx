import { useMemo, useState, type ReactNode } from 'react';
import { I18nContext, type I18nValue } from './context';
import type { Locale } from './locale';
import { createTranslator } from './translate';

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
