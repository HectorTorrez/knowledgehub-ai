import type { Translator } from '~/lib/i18n/translate';
import {
  isApiError,
  isNetworkError,
  fallbackMessage,
  isRateLimited,
} from './errors';

const STATUS_MESSAGE_KEYS: Record<
  number,
  | 'errors.unauthorized'
  | 'errors.forbidden'
  | 'errors.notFound'
  | 'errors.rateLimited'
  | 'errors.unavailable'
> = {
  401: 'errors.unauthorized',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  429: 'errors.rateLimited',
  503: 'errors.unavailable',
};

export function retryMessage(seconds: number, t: Translator): string {
  if (seconds <= 0) {
    return t('errors.retryNow');
  }

  if (seconds < 60) {
    return t('errors.retrySeconds', { count: seconds });
  }

  return t('errors.retryMinutes', { count: Math.ceil(seconds / 60) });
}

export function describeError(
  error: unknown,
  t: Translator,
): { title: string; details: string[] } {
  if (isNetworkError(error)) {
    return { title: t('errors.network'), details: [] };
  }

  if (!isApiError(error)) {
    return {
      title: error instanceof Error ? error.message : t('errors.generic'),
      details: [],
    };
  }

  const details: string[] = [];

  if (isRateLimited(error)) {
    details.push(retryMessage(error.retryAfterSeconds ?? 0, t));
  }

  if (error.validationErrors.length > 1) {
    details.push(...error.validationErrors);
  }

  const statusKey = STATUS_MESSAGE_KEYS[error.status];

  if (statusKey) {
    return { title: t(statusKey), details };
  }

  if (error.status >= 500) {
    return { title: t('errors.server'), details };
  }

  if (error.message === fallbackMessage(error.status)) {
    return { title: t('errors.generic'), details };
  }

  return { title: error.message, details };
}
