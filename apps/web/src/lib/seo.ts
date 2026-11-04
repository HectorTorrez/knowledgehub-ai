const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export const SITE_NAME = 'KnowledgeHub AI';

export function resolveSiteUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return '';
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return '';
  }

  return HTTP_PROTOCOLS.has(url.protocol) ? url.origin : '';
}

export function absoluteUrl(siteUrl: string, path: string): string | undefined {
  if (siteUrl.length === 0) {
    return undefined;
  }

  return new URL(path, `${siteUrl}/`).toString();
}

export const SITE_URL = resolveSiteUrl(import.meta.env.VITE_SITE_URL);

export interface PageHeadOptions {
  title: string;
  description?: string;
  path?: string;
  siteUrl?: string;
  imageAlt?: string;
}

export function pageHead({
  title,
  description,
  path,
  siteUrl = SITE_URL,
  imageAlt,
}: PageHeadOptions) {
  const canonical = path ? absoluteUrl(siteUrl, path) : undefined;
  const image = absoluteUrl(siteUrl, '/og-image.png');

  return {
    meta: [
      { title },
      ...(description
        ? [
            { name: 'description', content: description },
            { property: 'og:description', content: description },
            { name: 'twitter:description', content: description },
          ]
        : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: title },
      ...(canonical ? [{ property: 'og:url', content: canonical }] : []),
      ...(image
        ? [
            { property: 'og:image', content: image },
            { property: 'og:image:width', content: '1200' },
            { property: 'og:image:height', content: '630' },
            ...(imageAlt
              ? [{ property: 'og:image:alt', content: imageAlt }]
              : []),
          ]
        : []),
      {
        name: 'twitter:card',
        content: image ? 'summary_large_image' : 'summary',
      },
      { name: 'twitter:title', content: title },
      ...(image ? [{ name: 'twitter:image', content: image }] : []),
    ],
    links: canonical ? [{ rel: 'canonical', href: canonical }] : [],
  };
}
