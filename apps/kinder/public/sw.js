// Service Worker: macht die App installierbar und lädt die Oberfläche schneller.
// Lerndaten (/api) werden NIE zwischengespeichert – sie kommen immer frisch vom Server.
const CACHE = 'karteikarten-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/betreuer')) return;

  // Seitenaufrufe: zuerst Netz (immer neueste Version), ohne Netz die gespeicherte Startseite
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Logo, Icons, Manifest: aus dem Netz, ohne Verbindung aus dem Speicher (sonst fehlt z. B. das Logo auf der Anmeldeseite)
  if (SHELL.includes(url.pathname) || url.pathname.endsWith('.png')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Gebaute Dateien haben eindeutige Namen → dürfen dauerhaft aus dem Speicher kommen
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit ?? fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })),
    );
  }
});
