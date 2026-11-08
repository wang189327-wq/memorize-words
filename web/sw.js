/* Offline shell only. This worker never owns learning records, account tokens, or cloud responses. */
importScripts('offline-assets.js');
const shell = self.WORDMEMO_SHELL;
const prefix = 'memorize-words:' + self.registration.scope + ':';
const cacheName = prefix + shell.version;
const assetURLs = new Set(
  shell.assets.map((asset) => new URL(asset.path, self.registration.scope).href),
);
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const outcomes = await Promise.allSettled(
        shell.assets.map(async (asset) => {
          const url = new URL(asset.path, self.registration.scope);
          const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
          if (!response.ok) throw Error('Offline asset unavailable: ' + asset.path);
          const hash = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
          const hex = Array.from(new Uint8Array(hash), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join('');
          if (hex !== asset.sha256) throw Error('Offline asset checksum mismatch: ' + asset.path);
          await cache.put(url, response);
        }),
      );
      if (outcomes.some((outcome) => outcome.status === 'rejected')) {
        await caches.delete(cacheName);
        throw Error('Incomplete offline update; previous shell retained.');
      }
      // No unconditional skipWaiting: active learning must not be replaced underneath the user.
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'ACTIVATE_UPDATE') return;
  event.waitUntil(
    (async () => {
      const tabs = (
        await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      ).filter((client) => client.url.startsWith(self.registration.scope));
      if (tabs.length > 1) {
        event.source?.postMessage({ type: 'UPDATE_BLOCKED' });
        return;
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(self.registration.scope).origin) return;
  const index = new URL('index.html', self.registration.scope).href;
  const home = new URL(self.registration.scope).pathname;
  const navigation =
    request.mode === 'navigate' &&
    (url.pathname === home || url.pathname === new URL(index).pathname);
  if (!navigation && (!assetURLs.has(url.href) || url.search)) return;
  event.respondWith(
    caches
      .open(cacheName)
      .then(async (cache) => (await cache.match(navigation ? index : request)) || fetch(request)),
  );
});
