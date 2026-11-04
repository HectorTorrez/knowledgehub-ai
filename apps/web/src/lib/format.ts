import type { OrganizationRole } from '@knowledgehub/shared-types';
import type { Locale } from '~/lib/i18n/locale';
import type { Translator } from '~/lib/i18n/translate';

export function formatBytes(bytes: number, locale: Locale): string {
  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);

  if (bytes < 1024) {
    return `${number(bytes, 0)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${number(bytes / 1024, 1)} KB`;
  }

  return `${number(bytes / (1024 * 1024), 1)} MB`;
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
}

export function formatRole(role: OrganizationRole, t: Translator): string {
  return t(`roles.${role}`);
}

export function formatMinorAmount(
  amountMinor: string,
  currency: string,
  scale: number,
  locale: Locale,
): string {
  const value = Number(amountMinor) / 10 ** scale;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(value);
  } catch {
    return `${value.toFixed(scale)} ${currency}`;
  }
}
