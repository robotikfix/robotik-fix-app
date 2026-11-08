const CACHE_NAME = 'robotik-fix-v5-0';
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
    caches.open(CACHE_NAME).then(cache => Promise.all(urlsToCache.map(u => cache.add(u).catch(() => null))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache the team database (Supabase) or WhatsApp — always go to the network.
  if (url.origin !== self.location.origin) return;
  // The version check must always ask the server, so the app can tell you a new version is ready.
  if (url.pathname.endsWith('version.json')) return;

  // Network-first for the app page itself, so a new version shows as soon as
  // the phone/laptop is online, instead of being stuck on an old cached copy.
  // Falls back to the cached copy when offline.
  // The page, manifest and icons are network-first: a new version or new icons show as soon as you're online.
  const isPage = event.request.mode === 'navigate' ||
    event.request.url.endsWith('/index.html') ||
    event.request.url.endsWith('/') ||
    event.request.url.endsWith('.webmanifest') ||
    url.pathname.indexOf('/icons/') !== -1;

  if (isPage) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest).
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
