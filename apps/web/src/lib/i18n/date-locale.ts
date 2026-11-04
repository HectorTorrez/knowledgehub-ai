import { enUS, es } from 'date-fns/locale';
import type { Locale } from './locale';

export function dateFnsLocale(locale: Locale) {
  return locale === 'es' ? es : enUS;
}
