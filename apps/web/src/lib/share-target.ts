export const SHARE_CACHE = 'knowledgehub-share-target';
const SHARE_META = '/share-target/meta';

export interface SharedMeta {
  title: string;
  text: string;
  url: string;
  files: Array<{ key: string; name: string; type: string }>;
}

export interface SharedPayload {
  title: string;
  url: string | null;
  files: File[];
}

export function sharedLink(
  meta: Pick<SharedMeta, 'url' | 'text'>,
): string | null {
  for (const candidate of [meta.url, ...meta.text.split(/\s+/)]) {
    const value = candidate.trim();

    if (!/^https?:\/\//i.test(value)) {
      continue;
    }

    try {
      return new URL(value).toString();
    } catch {
      continue;
    }
  }

  return null;
}

export async function readSharedPayload(): Promise<SharedPayload | null> {
  if (typeof caches === 'undefined' || !(await caches.has(SHARE_CACHE))) {
    return null;
  }

  const cache = await caches.open(SHARE_CACHE);
  const metaResponse = await cache.match(SHARE_META);

  if (metaResponse === undefined) {
    return null;
  }

  const meta = (await metaResponse.json()) as SharedMeta;
  const files = await Promise.all(
    meta.files.map(async (entry) => {
      const response = await cache.match(entry.key);
      const blob = await response?.blob();
      return blob === undefined
        ? null
        : new File([blob], entry.name, { type: entry.type || blob.type });
    }),
  );

  return {
    title: meta.title.trim(),
    url: sharedLink(meta),
    files: files.filter((file): file is File => file !== null),
  };
}

export async function clearSharedPayload(): Promise<void> {
  if (typeof caches !== 'undefined') {
    await caches.delete(SHARE_CACHE);
  }
}

export function registerServiceWorker(): void {
  if (
    import.meta.env.DEV ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
