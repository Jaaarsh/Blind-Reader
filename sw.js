// Service worker: cache the app shell so Blind Reader opens instantly and
// still launches with no signal (the reading itself needs the network).

const CACHE = 'blind-reader-v10';
const SHELL = [
  'index.html',
  'settings.html',
  'css/app.css',
  'js/app.js',
  'js/camera.js',
  'js/claude.js',
  'js/speech.js',
  'js/sounds.js',
  'js/store.js',
  'js/settings-page.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-180.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept API traffic (our proxy or Anthropic directly).
  if (event.request.method !== 'GET') return;
  if (url.pathname.includes('/api/') || url.hostname === 'api.anthropic.com') return;

  // Network-first for navigations (fresh HTML when online), cache-first for assets.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit =>
      hit ||
      fetch(event.request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return res;
      })
    )
  );
});
