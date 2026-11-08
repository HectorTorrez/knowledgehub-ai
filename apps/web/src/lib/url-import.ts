import type { Translator } from '~/lib/i18n/translate';

export function isValidImportUrl(value: string): boolean {
  if (value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function urlImportErrorMessage(error: unknown, t: Translator): string {
  const body = error instanceof Error ? error.cause : undefined;
  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? body.code
      : undefined;
  switch (code) {
    case 'URL_NOT_ALLOWED':
      return t('documents.urlNotAllowed');
    case 'URL_FETCH_FAILED':
      return t('documents.urlFetchFailed');
    case 'URL_UNSUPPORTED_TYPE':
      return t('documents.urlUnsupportedType');
    case 'URL_TOO_LARGE':
      return t('documents.urlTooLarge');
    default:
      return t('documents.urlImportFailed');
  }
}
