const SHARE_CACHE = 'knowledgehub-share-target';
const SHARE_META = '/share-target/meta';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/share-target'
  ) {
    event.respondWith(receiveShare(event.request));
  }
});

function text(value) {
  return typeof value === 'string' ? value : '';
}

async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('files').filter((value) => value instanceof File);
  const cache = await caches.open(SHARE_CACHE);
  const stale = await cache.keys();
  await Promise.all(stale.map((key) => cache.delete(key)));

  const entries = files.map((file, index) => ({
    key: `/share-target/file/${index}`,
    name: file.name,
    type: file.type,
  }));

  await Promise.all(
    files.map((file, index) =>
      cache.put(
        entries[index].key,
        new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
          },
        }),
      ),
    ),
  );
  await cache.put(
    SHARE_META,
    new Response(
      JSON.stringify({
        title: text(form.get('title')),
        text: text(form.get('text')),
        url: text(form.get('url')),
        files: entries,
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );

  return Response.redirect('/share', 303);
}
