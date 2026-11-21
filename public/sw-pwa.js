/**
 * Service Worker EASY-KIOSQUE — PWA + continuité hors-ligne.
 *
 * - /_next/static (noms hachés en production) : cache-first.
 * - Images, icônes, /js : réseau d'abord, repli cache (jamais d'image périmée).
 * - Navigations : network-first, repli cache puis /offline.html.
 * - /api/* : jamais mis en cache — le réseau seul décide ; les ventes
 *   hors-ligne sont gérées par la file locale (localStorage), pas ici.
 */

const CACHE = 'ek-v2';
const STATIC_PRECACHED = ['/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_PRECACHED)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Jamais de cache sur l'API ni sur les requêtes non-GET
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') return;

  // Chunks Next hachés : cache-first
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations : network-first, repli cache puis page hors-ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Autres GET : network avec repli cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
