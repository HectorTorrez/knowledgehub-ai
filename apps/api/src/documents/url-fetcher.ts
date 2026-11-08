import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  DOCX_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  PPTX_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  type AllowedUploadContentType,
} from './upload-policy.js';

export type UrlFetchErrorCode =
  | 'URL_NOT_ALLOWED'
  | 'URL_FETCH_FAILED'
  | 'URL_UNSUPPORTED_TYPE'
  | 'URL_TOO_LARGE';

export class UrlFetchError extends Error {
  constructor(readonly code: UrlFetchErrorCode) {
    super(code);
  }
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const extensions: Record<string, AllowedUploadContentType> = {
  pdf: 'application/pdf',
  docx: DOCX_CONTENT_TYPE,
  pptx: PPTX_CONTENT_TYPE,
  xlsx: XLSX_CONTENT_TYPE,
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
};

type Resolver = typeof lookup;

const FETCH_TIMEOUT_MS = 10_000;

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => reject(new UrlFetchError('URL_FETCH_FAILED'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then(resolvePromise, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function fetchDocumentUrl(
  input: string,
  resolve: Resolver = lookup,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{
  bytes: Buffer;
  contentType: AllowedUploadContentType;
  url: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = input;
    for (let redirects = 0; redirects <= 3; redirects++) {
      let url: URL;
      try {
        url = new URL(current);
      } catch {
        throw new UrlFetchError('URL_NOT_ALLOWED');
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.port && !['80', '443'].includes(url.port))
      )
        throw new UrlFetchError('URL_NOT_ALLOWED');
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await abortable(
        resolve(hostname, { all: true, verbatim: true }),
        controller.signal,
      );
      if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicAddress(address))
      )
        throw new UrlFetchError('URL_NOT_ALLOWED');
      const address = addresses[0];
      const response = await new Promise<import('node:http').IncomingMessage>(
        (resolveResponse, reject) => {
          const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
            url,
            {
              signal: controller.signal,
              headers: { 'user-agent': 'KnowledgeHubBot/1.0' },
              lookup: (_host, _options, callback) =>
                callback(null, address.address, address.family),
            },
            resolveResponse,
          );
          req.on('error', reject);
          req.end();
        },
      );
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.destroy();
        if (redirects === 3) throw new UrlFetchError('URL_FETCH_FAILED');
        current = new URL(response.headers.location, url).href;
        continue;
      }
      if (
        !response.statusCode ||
        response.statusCode < 200 ||
        response.statusCode >= 300
      ) {
        response.destroy();
        throw new UrlFetchError('URL_FETCH_FAILED');
      }
      const type = response.headers['content-type']
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      const contentType =
        ALLOWED_UPLOAD_CONTENT_TYPES.find((item) => item === type) ??
        extensions[url.pathname.split('.').pop()?.toLowerCase() ?? ''];
      if (!contentType) {
        response.destroy();
        throw new UrlFetchError('URL_UNSUPPORTED_TYPE');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response) {
        const buffer = Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > MAX_UPLOAD_BYTES) {
          response.destroy();
          throw new UrlFetchError('URL_TOO_LARGE');
        }
        chunks.push(buffer);
      }
      return { bytes: Buffer.concat(chunks), contentType, url: url.href };
    }
    throw new UrlFetchError('URL_FETCH_FAILED');
  } catch (error) {
    if (error instanceof UrlFetchError) throw error;
    throw new UrlFetchError('URL_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}
