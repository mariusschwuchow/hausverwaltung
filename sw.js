const CACHE = 'hausverwaltung-v3';
const ASSETS = ['./', 'index.html', 'style.css', 'util.js', 'db.js', 'finance.js', 'meters.js', 'app.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(ASSETS.map((url) => new Request(url, { cache: 'no-cache' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

// App-Dateien: zuerst Netzwerk, ohne Netz aus dem Cache. 'no-cache' umgeht den
// HTTP-Zwischenspeicher (GitHub Pages: bis zu 10 Minuten), damit Updates sofort ankommen.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
