export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'locale';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
  );
}

export function cookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return undefined;
}

export function parseAcceptLanguage(
  header: string | null | undefined,
): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const quality = params.reduce((value, param) => {
        const [key, raw] = param.trim().split('=');
        return key === 'q' ? Number(raw) : value;
      }, 1);
      return {
        tag: tag.trim(),
        quality: Number.isNaN(quality) ? 0 : quality,
        index,
      };
    })
    .filter(({ tag, quality }) => tag.length > 0 && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}

export function localeFromLanguageTags(
  languages: readonly string[],
): Locale | undefined {
  for (const language of languages) {
    const primary = language.split('-')[0]?.toLowerCase();
    if (isLocale(primary)) {
      return primary;
    }
  }

  return undefined;
}

export function resolveLocale({
  cookie,
  languages,
}: {
  cookie: string | null | undefined;
  languages: readonly string[];
}): Locale {
  if (isLocale(cookie)) {
    return cookie;
  }

  return localeFromLanguageTags(languages) ?? DEFAULT_LOCALE;
}
