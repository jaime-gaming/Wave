/**
 * Wave's offline shell.
 *
 * Only the interface is cached: HTML, JavaScript, CSS, fonts and icons. Audio
 * and artwork live in the browser's own storage and are never seen here.
 *
 * The cache name is derived from the built index.html by the Vite plugin, which
 * substitutes the build id below at build time. Every deploy therefore
 * installs a new worker, deletes the previous build's cache and precaches the
 * HTML *together with the exact hashed assets it references*. That is the fix
 * for the blank page that needed Ctrl+Shift+R: an old HTML could point at
 * bundles that no longer exist, and a hard reload was the only way out.
 */
const BUILD = '__WAVE_BUILD_ID__';
const PREFIX = 'wave-shell-';
const CACHE = PREFIX + BUILD;
const SHELL = ['./', './index.html', './manifest.webmanifest'];
const FALLBACK = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Never take the document from the browser's HTTP cache: that is how an
      // old build can survive a redeploy behind a service worker that never
      // changed its script.
      const doc = await fetch(new Request(FALLBACK, { cache: 'reload' }));
      if (!doc.ok) throw new Error('Wave could not fetch a fresh shell.');
      const payload = await doc.clone().text();
      await cache.put(FALLBACK, doc);
      await Promise.allSettled(
        [...SHELL.filter((url) => url !== FALLBACK), ...shellAssets(payload)].map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (response.ok) await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** The local script/style/font/image URLs the built document actually asks for. */
function shellAssets(html) {
  const urls = new Set();
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    if (!value || /^(?:https?:|data:|blob:|#|mailto:)/i.test(value)) continue;
    let url;
    try {
      url = new URL(value, self.registration.scope);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) continue;
    if (
      /\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico|webmanifest)(?:$|\?)/i.test(
        url.pathname,
      )
    )
      urls.add(url.pathname + url.search);
  }
  return [...urls];
}

/** Tell an open tab that its document belongs to a build whose assets are gone. */
async function notifyStale() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'WAVE_SHELL_STALE' });
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WAVE_RECOVER') return;
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(PREFIX)).map((key) => caches.delete(key)),
      );
      await notifyStale();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: fresh when online, remembered when not. The copy is written to the
  // build's own cache, and its assets are primed before the tab can ask for
  // them, so an offline document can never be paired with another build's JS.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            event.waitUntil(
              (async () => {
                const cache = await caches.open(CACHE);
                const html = await response.clone().text();
                await cache.put(FALLBACK, response.clone());
                await Promise.allSettled(
                  shellAssets(html).map(async (asset) => {
                    const assetResponse = await fetch(new Request(asset, { cache: 'reload' }));
                    if (assetResponse.ok) await cache.put(asset, assetResponse);
                  }),
                );
              })().catch(() => undefined),
            );
          }
          return response;
        })
        .catch(async () => (await caches.match(FALLBACK)) ?? Response.error()),
    );
    return;
  }

  // The boot watchdog is small, but it must be the current build's copy: a
  // stale one could keep a broken shell alive.
  if (url.pathname.endsWith('/boot.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, response.clone())),
            );
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? Response.error()),
    );
    return;
  }

  // Hashed assets of this build are served from the cache and only fetched on a
  // miss. A missing hashed bundle is the exact symptom of a stale document, so
  // the tab is told to recover itself instead of waiting for a hard reload.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          } else if (
            (response.status === 404 || response.status === 410) &&
            url.pathname.startsWith('/assets/')
          ) {
            event.waitUntil(notifyStale());
          }
          return response;
        }),
    ),
  );
});
