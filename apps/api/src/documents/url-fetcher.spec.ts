import { describe, expect, it } from 'vitest';
import { fetchDocumentUrl, isPublicAddress } from './url-fetcher.js';

describe('URL address validation', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it('permits public addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it.each(['file:///etc/passwd', 'http://user:password@example.com'])(
    'rejects %s',
    async (url) => {
      await expect(fetchDocumentUrl(url)).rejects.toMatchObject({
        code: 'URL_NOT_ALLOWED',
      });
    },
  );
});
