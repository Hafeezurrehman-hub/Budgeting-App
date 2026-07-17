// Service worker for the Budgeting App — makes the app fully usable offline after the first visit.
// Strategy:
//  - Navigations (opening/reloading the app): network-first, falling back to the cached index.html.
//  - Cross-origin CDN assets (Chart.js, PapaParse, Firebase SDK, Google Fonts): cache-first,
//    so once they've loaded once, the app never needs the network for them again.
//  - Same-origin assets (icons, manifest): cache-first with a background refresh.
const CACHE_NAME = 'khaata-budget-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(()=>{ /* ok if some are missing */ }))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // App navigations — try the network first (so users get updates), fall back to the
  // cached app shell the moment there's no connection.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html').then(res => res || caches.match('./')))
    );
    return;
  }

  const url = new URL(req.url);
  const isCrossOrigin = url.origin !== self.location.origin;

  if (isCrossOrigin) {
    // CDN libraries and fonts: once cached, always serve from cache first.
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Same-origin static assets: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
