/**
 * Ancien service worker EASY-KIOSQUE — remplacé par /sw-pwa.js.
 *
 * Kill-switch : l'ancienne version servait les assets en cache-first et
 * figeait l'interface (anciens JS, anciennes images). Le navigateur
 * revérifie toujours ce fichier sur le réseau : cette version vide tous
 * les caches, se désenregistre et recharge les onglets ouverts.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
