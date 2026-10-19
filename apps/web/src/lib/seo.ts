const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export const SITE_NAME = 'KnowledgeHub AI';

export const DEFAULT_TITLE =
  "KnowledgeHub AI — Ask your organization's documents anything";

export const DEFAULT_DESCRIPTION =
  'KnowledgeHub AI is a multi-tenant retrieval-augmented platform: upload documents, search across every organization, and get grounded answers with citations to their sources.';

export const OG_IMAGE_ALT =
  'KnowledgeHub AI — grounded answers across your documents';

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
}

export function pageHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  siteUrl = SITE_URL,
}: PageHeadOptions) {
  const canonical = path ? absoluteUrl(siteUrl, path) : undefined;
  const image = absoluteUrl(siteUrl, '/og-image.png');

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      ...(canonical ? [{ property: 'og:url', content: canonical }] : []),
      ...(image
        ? [
            { property: 'og:image', content: image },
            { property: 'og:image:width', content: '1200' },
            { property: 'og:image:height', content: '630' },
            { property: 'og:image:alt', content: OG_IMAGE_ALT },
          ]
        : []),
      {
        name: 'twitter:card',
        content: image ? 'summary_large_image' : 'summary',
      },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      ...(image ? [{ name: 'twitter:image', content: image }] : []),
    ],
    links: canonical ? [{ rel: 'canonical', href: canonical }] : [],
  };
}
