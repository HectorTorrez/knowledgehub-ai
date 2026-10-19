import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  pageHead,
  resolveSiteUrl,
  SITE_NAME,
} from './seo';

describe('resolveSiteUrl', () => {
  it('returns the origin for an absolute http(s) URL', () => {
    expect(resolveSiteUrl('https://knowledgehub.ai')).toBe(
      'https://knowledgehub.ai',
    );
    expect(resolveSiteUrl('https://knowledgehub.ai/')).toBe(
      'https://knowledgehub.ai',
    );
    expect(resolveSiteUrl('  http://localhost:3000  ')).toBe(
      'http://localhost:3000',
    );
  });

  it('drops any path, query, or fragment', () => {
    expect(resolveSiteUrl('https://knowledgehub.ai/app?x=1#top')).toBe(
      'https://knowledgehub.ai',
    );
  });

  it('falls back to an empty string for blank, missing, or invalid values', () => {
    expect(resolveSiteUrl(undefined)).toBe('');
    expect(resolveSiteUrl('')).toBe('');
    expect(resolveSiteUrl('   ')).toBe('');
    expect(resolveSiteUrl(42)).toBe('');
    expect(resolveSiteUrl('not a url')).toBe('');
    expect(resolveSiteUrl('ftp://knowledgehub.ai')).toBe('');
  });
});

describe('absoluteUrl', () => {
  it('resolves a path against the site origin', () => {
    expect(absoluteUrl('https://knowledgehub.ai', '/login')).toBe(
      'https://knowledgehub.ai/login',
    );
    expect(absoluteUrl('https://knowledgehub.ai', '/og-image.png')).toBe(
      'https://knowledgehub.ai/og-image.png',
    );
  });

  it('is undefined without a configured site URL', () => {
    expect(absoluteUrl('', '/login')).toBeUndefined();
  });
});

type Meta = { title?: string; name?: string; property?: string; content?: string };

function findMeta(meta: Meta[], key: string): Meta | undefined {
  return meta.find((entry) => entry.name === key || entry.property === key);
}

describe('pageHead', () => {
  it('emits title, description, and Open Graph tags', () => {
    const { meta } = pageHead({
      title: 'Sign in · KnowledgeHub AI',
      description: 'Sign in to your account.',
      siteUrl: 'https://knowledgehub.ai',
      path: '/login',
    });

    expect(meta[0]).toEqual({ title: 'Sign in · KnowledgeHub AI' });
    expect(findMeta(meta, 'description')?.content).toBe(
      'Sign in to your account.',
    );
    expect(findMeta(meta, 'og:title')?.content).toBe(
      'Sign in · KnowledgeHub AI',
    );
    expect(findMeta(meta, 'og:site_name')?.content).toBe(SITE_NAME);
    expect(findMeta(meta, 'og:url')?.content).toBe(
      'https://knowledgehub.ai/login',
    );
    expect(findMeta(meta, 'og:image')?.content).toBe(
      'https://knowledgehub.ai/og-image.png',
    );
    expect(findMeta(meta, 'twitter:card')?.content).toBe(
      'summary_large_image',
    );
  });

  it('adds a canonical link for the page path', () => {
    const { links } = pageHead({
      title: 'Sign in · KnowledgeHub AI',
      siteUrl: 'https://knowledgehub.ai',
      path: '/login',
    });

    expect(links).toEqual([
      { rel: 'canonical', href: 'https://knowledgehub.ai/login' },
    ]);
  });

  it('uses the default description when none is provided', () => {
    const { meta } = pageHead({ title: 'KnowledgeHub AI' });

    expect(findMeta(meta, 'description')?.content).toBe(DEFAULT_DESCRIPTION);
  });

  it('omits absolute URLs when no site URL is configured', () => {
    const { meta, links } = pageHead({
      title: 'KnowledgeHub AI',
      siteUrl: '',
      path: '/login',
    });

    expect(findMeta(meta, 'og:url')).toBeUndefined();
    expect(findMeta(meta, 'og:image')).toBeUndefined();
    expect(findMeta(meta, 'twitter:card')?.content).toBe('summary');
    expect(links).toEqual([]);
  });
});
