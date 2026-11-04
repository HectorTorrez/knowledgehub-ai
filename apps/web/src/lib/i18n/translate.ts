import { en } from './messages/en';
import { es } from './messages/es';
import type { Locale } from './locale';
import type { MessageKey } from './types';
import type { Messages } from './messages/schema';

export type { Messages };

export type TranslationParams = Record<string, string | number>;

export type Translator = (
  key: MessageKey<Messages>,
  params?: TranslationParams,
) => string;

export const MESSAGES: Record<Locale, Messages> = { en, es };

function lookup(messages: Messages, path: string): string | undefined {
  let node: unknown = messages;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

export function interpolate(
  template: string,
  params: TranslationParams = {},
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

export function resolveMessage(
  messages: Messages,
  locale: Locale,
  key: string,
  params: TranslationParams = {},
): string {
  const direct = lookup(messages, key);
  if (direct !== undefined) {
    return interpolate(direct, params);
  }

  const count = params.count;
  if (typeof count === 'number') {
    const category = new Intl.PluralRules(locale).select(count);
    const plural =
      lookup(messages, `${key}_${category}`) ??
      lookup(messages, `${key}_other`);
    if (plural !== undefined) {
      return interpolate(plural, params);
    }
  }

  return key;
}

export function createTranslator(locale: Locale): Translator {
  const messages = MESSAGES[locale];
  return (key, params) => resolveMessage(messages, locale, key, params);
}
