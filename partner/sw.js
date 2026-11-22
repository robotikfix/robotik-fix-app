const CACHE_NAME = 'partner-garage-v8-3';
// Each app (main, partner, garage, fleet) shares one web address, so each keeps its OWN caches:
// a new version only deletes older caches with its own prefix, never another app's.
const PREFIX = CACHE_NAME.replace(/v[\d-]+$/, '');
const SUB_APPS = ['partner/', 'garage/', 'fleet/'];
const urlsToCache = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  // Cache each file on its own, so one missing file (e.g. an icon) can't stop offline mode working.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(urlsToCache.map(u => cache.add(new Request(u, {cache: 'reload'})).catch(() => null))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n.startsWith(PREFIX) && n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

function offlinePage(){
  return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;padding:24px;text-align:center"><h2>No connection</h2><p>The app could not load. Check your internet, then tap the button.</p><button onclick="location.reload()" style="font-size:18px;padding:10px 20px">Try again</button></body>',
    {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}});
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache the team database (Supabase) or WhatsApp — always go to the network.
  if (url.origin !== self.location.origin) return;
  // Pages of the other apps (partner/, garage/, fleet/) are handled by their own service worker.
  const rel = event.request.url.slice(self.registration.scope.length);
  if (event.request.url.startsWith(self.registration.scope) && SUB_APPS.some(p => rel.startsWith(p))) return;
  // The version check must always ask the server, so the app can tell you a new version is ready.
  if (url.pathname.endsWith('version.json')) return;

  const isPage = event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.indexOf('/icons/') !== -1;

  if (isPage) {
    // Network first, so a new version shows as soon as you're online; the saved copy when offline.
    event.respondWith(
      fetch(event.request.url, {cache: 'no-cache', credentials: 'same-origin'})
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request.url.split('?')[0], copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME)
          .then(cache => cache.match(event.request, {ignoreSearch: true})
            .then(r => r || cache.match(event.request.url.split('?')[0]))
            .then(r => r || (event.request.mode === 'navigate' ? cache.match('./index.html').then(x => x || cache.match('./')) : null)))
          .then(r => r || (event.request.mode === 'navigate' ? offlinePage() : Response.error()))
          .catch(() => event.request.mode === 'navigate' ? offlinePage() : Response.error()))
    );
    return;
  }

  // Cache-first for everything else.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(response => response || fetch(event.request))
      .catch(() => fetch(event.request))
  );
});
