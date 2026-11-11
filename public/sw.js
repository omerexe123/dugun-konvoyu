// Düğün Konvoyu - PWA Service Worker
const CACHE_NAME = 'konvoy-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Canlı WebSocket ve API istekleri hariç standart fetch
  if (event.request.url.includes('/api/') || event.request.url.startsWith('ws')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
