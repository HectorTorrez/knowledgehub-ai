import { describe, expect, it } from 'vitest';
import { toApiError } from '~/lib/api/errors';
import { createTranslator } from '~/lib/i18n/translate';
import { isValidImportUrl, urlImportErrorMessage } from './url-import';

describe('isValidImportUrl', () => {
  it('accepts HTTP and HTTPS URLs within the length limit', () => {
    expect(isValidImportUrl('http://example.com')).toBe(true);
    expect(isValidImportUrl(`https://example.com/${'a'.repeat(2028)}`)).toBe(
      true,
    );
  });

  it('rejects invalid, unsupported, padded, and oversized URLs', () => {
    for (const url of [
      '',
      'example.com',
      'ftp://example.com',
      ' https://example.com',
      `https://example.com/${'a'.repeat(2029)}`,
    ]) {
      expect(isValidImportUrl(url)).toBe(false);
    }
  });
});

describe('urlImportErrorMessage', () => {
  it.each([
    ['URL_NOT_ALLOWED', 'This URL is not allowed.'],
    ['URL_FETCH_FAILED', 'Unable to fetch the document from this URL.'],
    ['URL_UNSUPPORTED_TYPE', 'This URL points to an unsupported file type.'],
    ['URL_TOO_LARGE', 'The document at this URL is too large.'],
    ['OTHER', 'Unable to import the document. Please try again.'],
  ])('maps %s to a localized message', (code, message) => {
    expect(
      urlImportErrorMessage(toApiError(422, { code }), createTranslator('en')),
    ).toBe(message);
  });
});
